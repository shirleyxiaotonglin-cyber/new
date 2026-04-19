import { NextResponse } from "next/server";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@/lib/constants";
import { getOpenRouterAttribution } from "@/lib/openrouter";
import {
  extractJsonObject,
  isOpenRouterHttpError,
  openRouterComplete,
} from "@/lib/openrouter";

type Ctx = { params: Promise<{ orgId: string }> };

const PostBody = z.object({
  scope: z.enum(["today", "week", "month"]),
});

const TaskReviewItemSchema = z.object({
  taskId: z.string().nullable().optional(),
  title: z.string(),
  projectName: z.string().optional(),
  status: z.string().optional(),
  progressNote: z.string().optional(),
});

const ReportOutputSchema = z.object({
  reportTitle: z.string().optional(),
  executiveSummary: z.string(),
  keyAchievements: z.array(z.string()).optional(),
  progressAndCompletionAnalysis: z.string(),
  taskReview: z.array(TaskReviewItemSchema).optional(),
  risksOrDelays: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
  nextFocus: z.array(z.string()).optional(),
});

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

function buildSystemPrompt(
  scope: "today" | "week" | "month",
  periodLabel: string,
  statsSummary: string,
) {
  const scopeIntro =
    scope === "today" ?
      `撰写「今日工作报告」：回顾今日在推进任务上的进展与完成情况，客观分析进度百分比与状态；对未完成项说明可能原因；提出明日关注点（简明）。`
    : scope === "week" ?
      `撰写「本周工作报告」：按周汇总交付与进度，对照截止日与状态；总结亮点与延期风险；提出下周优先事项。`
    : `撰写「本月工作报告」：月度复盘任务完成率与重点交付；分析进度与健康度；对跨项目负载给出观察；提出下月改进方向。`;

  return `你是企业工作报告撰写助手，语气专业、简洁，避免空话套话。
${scopeIntro}

用户数据包含：分配给他的任务清单（含项目、状态、优先级、进度、截止日等），以及统计摘要：
${statsSummary}

报告周期说明：${periodLabel}

必须只输出一个 JSON 对象，不要 markdown 代码围栏，不要正文外的解释。格式严格如下：
{"reportTitle":"简短标题","executiveSummary":"2-4句执行摘要","keyAchievements":["可选：本周/本月亮点"],"progressAndCompletionAnalysis":"一段连贯文字，分析整体进度与完成情况、瓶颈","taskReview":[{"taskId":"来自输入的任务id或null","title":"任务名","projectName":"项目","status":"TODO等","progressNote":"对该任务进度或完成的点评"}],"risksOrDelays":["风险或延期项"],"suggestions":["改进或协作建议"],"nextFocus":["后续关注或行动"]}

规则：
- 严格基于输入任务与统计推理，禁止捏造未提供的任务。
- taskReview 优先覆盖重点/高风险/临近截止的任务，不必列出全部（可择要 8–15 条）。
- 语言：中文。
- 若任务为空，仍输出合法 JSON：executiveSummary 说明暂无任务；analysis 说明建议认领工作；其它数组可为空。`;
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
  const weekLabel = `本周（${format(weekMonday, "yyyy-MM-dd", { locale: zhCN })} 至 ${format(weekSunday, "yyyy-MM-dd", { locale: zhCN })}，周一至周日）`;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthLabel = `${format(now, "yyyy年M月", { locale: zhCN })}（${format(monthStart, "yyyy-MM-dd")} 至 ${format(monthEnd, "yyyy-MM-dd")}）`;

  const periodLabel =
    scope === "today" ? `今日：${todayLabel}` : scope === "week" ? weekLabel : monthLabel;

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: session.sub,
      project: { orgId },
      parentId: null,
    },
    orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    take: 120,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      startDate: true,
      progress: true,
      description: true,
      project: { select: { name: true } },
    },
  });

  const overdue =
    tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== TaskStatus.DONE)
      .length;
  const done = tasks.filter((t) => t.status === TaskStatus.DONE).length;
  const byStatus: Record<string, number> = {};
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  }
  const avgProgress =
    tasks.length > 0 ?
      Math.round(tasks.reduce((s, t) => s + (t.progress ?? 0), 0) / tasks.length)
    : 0;

  const statsSummary = [
    `任务总数：${tasks.length}`,
    `已完成(DONE)：${done}`,
    `逾期且未关闭：${overdue}`,
    `平均进度字段 progress：${avgProgress}%`,
    `按状态计数：${JSON.stringify(byStatus)}`,
  ].join("；");

  const payload = {
    period: periodLabel,
    scope,
    stats: {
      total: tasks.length,
      doneCount: done,
      overdueOpenCount: overdue,
      averageProgressPercent: avgProgress,
      byStatus,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      projectName: t.project.name,
      status: t.status,
      priority: t.priority,
      progressPercent: Math.round(t.progress ?? 0),
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      startDate: t.startDate ? t.startDate.toISOString() : null,
      descriptionSnippet:
        t.description && t.description.length > 0 ? t.description.slice(0, 200) : null,
    })),
  };

  const userContent =
    tasks.length === 0 ?
      "当前没有分配给我的任务。请仍输出合法 JSON：说明无任务可写；progressAndCompletionAnalysis 建议如何认领工作；其它数组可为空。"
    : JSON.stringify(payload, null, 2);

  const systemPrompt = buildSystemPrompt(scope, periodLabel, statsSummary);

  try {
    const { content, rawModel } = await openRouterComplete(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      { temperature: scope === "today" ? 0.3 : 0.35 },
    );
    const rawJson = extractJsonObject(content);
    const obj = JSON.parse(rawJson) as unknown;
    const out = ReportOutputSchema.safeParse(obj);
    if (!out.success) {
      return NextResponse.json(
        { error: "模型返回格式无法解析", detail: out.error.flatten(), raw: content.slice(0, 2000) },
        { status: 422 },
      );
    }

    return NextResponse.json({
      scope,
      report: out.data,
      model: rawModel,
      stats: payload.stats,
    });
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "MISSING_API_KEY") {
      return NextResponse.json(
        {
          error:
            "智能工作报告尚未开通，无法自动生成。如需使用，请联系管理员启用智能助手。",
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
