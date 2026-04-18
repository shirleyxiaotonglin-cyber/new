import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canEditTask } from "@/lib/access";
import { ActivityAction, TaskPriority, TaskStatus } from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { taskDetailInclude } from "@/lib/task-includes";
import { extractJsonObject, openRouterComplete } from "@/lib/openrouter";
import { broadcastProjectSync } from "@/lib/project-realtime";

type Ctx = { params: Promise<{ projectId: string }> };

const Body = z.object({
  text: z.string().min(10),
  /** 为 true 时分析结果将直接写入数据库 */
  apply: z.boolean().optional(),
});

const ParsedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum([TaskPriority.P0, TaskPriority.P1, TaskPriority.P2, TaskPriority.P3]).optional(),
  status: z
    .enum([TaskStatus.TODO, TaskStatus.DOING, TaskStatus.DONE, TaskStatus.BLOCKED])
    .optional(),
  /** 从今天起多少天内截止；无法推断可为 null */
  dueInDays: z.number().min(0).max(3650).nullable().optional(),
});

const OutputSchema = z.object({
  tasks: z.array(ParsedTaskSchema).max(40),
});

const SYSTEM_PROMPT = `你是项目管理助手。根据用户提供的文本，提取可执行的任务列表。
必须只输出一个 JSON 对象，不要 markdown，不要代码围栏。格式严格如下：
{"tasks":[{"title":"任务标题","description":"可选说明或null","priority":"P0"|"P1"|"P2"|"P3","status":"TODO"|"DOING"|"DONE"|"BLOCKED","dueInDays":数字或null}]}
规则：
- title 简短明确；description 可概括该任务要点。
- priority：紧急核心用 P0，重要 P1，普通 P2，低 P3；默认 P2。
- status 默认 TODO。
- dueInDays：若能从文本推断截止日期相对「今天」的天数则填整数，否则 null。
- 任务数量不超过 25 条，合并重复项。`;

function normalizeParsed(t: z.infer<typeof ParsedTaskSchema>) {
  const priority = t.priority ?? TaskPriority.P2;
  const status = t.status ?? TaskStatus.TODO;
  let dueDate: Date | undefined;
  if (typeof t.dueInDays === "number" && Number.isFinite(t.dueInDays)) {
    dueDate = addDays(new Date(), t.dueInDays);
    dueDate.setHours(23, 59, 59, 999);
  }
  return {
    title: t.title.slice(0, 500),
    description: t.description?.slice(0, 8000) ?? null,
    priority,
    status,
    dueDate,
  };
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsedBody = Body.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }

  const apply = parsedBody.data.apply === true;
  if (apply && !canEditTask(access.orgMember.role, access.projectMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawJson: string;
  try {
    const { content } = await openRouterComplete(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parsedBody.data.text.slice(0, 32000) },
      ],
      { temperature: 0.25 },
    );
    rawJson = extractJsonObject(content);
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "MISSING_API_KEY") {
      return NextResponse.json(
        {
          error: "未配置 OPENROUTER_API_KEY，请在 .env 中设置后重启服务。",
          code: "MISSING_API_KEY",
        },
        { status: 503 },
      );
    }
    const msg = e instanceof Error ? e.message : "OpenRouter 调用失败";
    return NextResponse.json({ error: msg, code: "OPENROUTER_ERROR" }, { status: 502 });
  }

  let structured: z.infer<typeof OutputSchema>;
  try {
    const obj = JSON.parse(rawJson) as unknown;
    const out = OutputSchema.safeParse(obj);
    if (!out.success) {
      return NextResponse.json(
        { error: "模型返回格式无法解析", detail: out.error.flatten() },
        { status: 422 },
      );
    }
    structured = out.data;
  } catch {
    return NextResponse.json({ error: "模型返回不是合法 JSON" }, { status: 422 });
  }

  if (structured.tasks.length === 0) {
    return NextResponse.json({ error: "未从文本中解析出任务", tasks: [] }, { status: 400 });
  }

  const normalized = structured.tasks.map(normalizeParsed);

  if (!apply) {
    return NextResponse.json({
      applied: false,
      tasks: normalized.map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate?.toISOString() ?? null,
      })),
    });
  }

  const maxOrder = await prisma.task.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });
  let order = (maxOrder._max.sortOrder ?? 0) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const t of normalized) {
      const task = await tx.task.create({
        data: {
          projectId,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          sortOrder: order++,
          activities: {
            create: {
              userId: session.sub,
              action: ActivityAction.TASK_CREATED,
              meta: JSON.stringify({ title: t.title, source: "openrouter_ai" }),
            },
          },
        },
        include: taskDetailInclude,
      });
      out.push(task);
    }
    return out;
  });

  await writeAudit(access.project.orgId, session.sub, "task", "create_batch", {
    projectId,
    count: created.length,
    source: "openrouter_ai",
  });

  broadcastProjectSync(projectId, {
    kind: "tasks_batch",
    actorUserId: session.sub,
  });

  return NextResponse.json({
    applied: true,
    count: created.length,
    tasks: created,
  });
}
