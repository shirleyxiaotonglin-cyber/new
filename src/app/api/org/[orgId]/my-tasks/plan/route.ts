import { NextResponse } from "next/server";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOpenRouterAttribution } from "@/lib/openrouter";
import {
  extractJsonObject,
  isOpenRouterHttpError,
  openRouterComplete,
} from "@/lib/openrouter";
import { tasksInvolvingMember } from "@/lib/my-tasks-scope";

export const maxDuration = 60;

type Ctx = { params: Promise<{ orgId: string }> };

const PostBody = z.object({
  scope: z.enum(["today", "week"]),
});

const PlanItemSchema = z.object({
  taskId: z.string().nullable().optional(),
  title: z.string(),
  projectName: z.string().optional(),
  reason: z.string().optional(),
  suggestedSlot: z.string().optional(),
  priorityHint: z.string().optional(),
});

const PlanSectionSchema = z.object({
  title: z.string(),
  items: z.array(PlanItemSchema),
});

const PlanOutputSchema = z.object({
  summary: z.string().optional(),
  sections: z.array(PlanSectionSchema),
  tips: z.array(z.string()).optional(),
});

/** GET：与项目 AI 一致，用于页面展示是否已配置 Key */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await ctx.params;

  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configured = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const model = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  const att = getOpenRouterAttribution();

  return NextResponse.json({
    configured,
    model,
    refererSource: att.refererSource,
    effectiveHttpReferer: att.omitAttribution ? null : att.referer,
    omitAttribution: att.omitAttribution,
  });
}

function buildSystemPrompt(scope: "today" | "week", todayLabel: string, weekRangeLabel: string) {
  const scopeDesc =
    scope === "today" ?
      `生成「今日计划表」：按合理顺序与时间段（如上午/下午/晚间或具体时段）排列，帮助用户在今天内推进工作。`
    : `生成「本周计划表」：按工作日（周一至周日）或「本周重点 / 待排期」分组，覆盖整周安排与里程碑。`;

  return `你是项目管理与时间管理助手。用户会提供其「与我相关的任务」列表（负责人为我，或我为协助人；含项目名、状态、优先级、截止日期、进度等）。
${scopeDesc}

必须只输出一个 JSON 对象，不要 markdown 包裹，不要多余说明。格式严格如下：
{"summary":"一句话总览计划思路","sections":[{"title":"分组标题（如今日上午 / 周一下午 / 周三）","items":[{"taskId":"若可对应输入中的任务 id 则填写否则 null","title":"任务标题","projectName":"项目名称","reason":"为何这样排","suggestedSlot":"建议时段或日期说明","priorityHint":"P0等"}]}],"tips":["可选的2-5条执行建议"]}

规则：
- 严格基于用户给出的任务列表推理；不要捏造不存在的任务。
- 已过期的截止任务应优先提醒；接近截止的优先。
- 「今天」指 ${todayLabel}；本周指 ${weekRangeLabel}。
- sections 至少 2 个分组；items 可引用输入中的任务 id（taskId）。
- 语言：中文。`;
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await ctx.params;

  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsedBody = PostBody.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }
  const { scope } = parsedBody.data;

  const now = new Date();
  const todayLabel = format(now, "yyyy-MM-dd EEEE", { locale: zhCN });
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekMonday = new Date(now);
  weekMonday.setDate(now.getDate() + diffToMonday);
  weekMonday.setHours(0, 0, 0, 0);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);
  const weekRangeLabel = `${format(weekMonday, "yyyy-MM-dd", { locale: zhCN })} 至 ${format(weekSunday, "yyyy-MM-dd", { locale: zhCN })}（当周周一至周日）`;

  const tasks = await prisma.task.findMany({
    where: tasksInvolvingMember(orgId, session.sub),
    orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    take: 80,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      startDate: true,
      progress: true,
      project: { select: { name: true } },
    },
  });

  const payload = {
    todayCalendar: todayLabel,
    weekCalendar: weekRangeLabel,
    taskCount: tasks.length,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.project.name,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      startDate: t.startDate ? t.startDate.toISOString() : null,
      progressPercent: Math.round(t.progress ?? 0),
    })),
  };

  const userContent =
    tasks.length === 0 ?
      "当前没有与我相关的任务（负责人或协助）。请仍输出合法 JSON：summary 说明无任务可排；sections 可为空数组或一条「暂无任务」提示；tips 给出如何新建/认领任务的建议。"
    : JSON.stringify(payload, null, 2);

  const systemPrompt = buildSystemPrompt(scope, todayLabel, weekRangeLabel);

  try {
    const { content, rawModel } = await openRouterComplete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { temperature: scope === "today" ? 0.35 : 0.4 },
    );
    const rawJson = extractJsonObject(content);
    const obj = JSON.parse(rawJson) as unknown;
    const out = PlanOutputSchema.safeParse(obj);
    if (!out.success) {
      return NextResponse.json(
        { error: "模型返回格式无法解析", detail: out.error.flatten(), raw: content.slice(0, 2000) },
        { status: 422 },
      );
    }

    return NextResponse.json({
      scope,
      plan: out.data,
      model: rawModel,
    });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "MISSING_API_KEY") {
      return NextResponse.json(
        {
          error:
            "智能计划功能尚未开通，无法生成安排表。如需使用，请联系管理员启用智能助手。",
          code: "MISSING_API_KEY",
        },
        { status: 503 },
      );
    }
    if (isOpenRouterHttpError(e)) {
      return NextResponse.json(
        { error: e.message, code: "OPENROUTER_HTTP_ERROR", httpStatus: e.httpStatus },
        { status: 502 },
      );
    }
    const msg = e instanceof Error ? e.message : "OpenRouter 调用失败";
    return NextResponse.json({ error: msg, code: "OPENROUTER_ERROR" }, { status: 502 });
  }
}
