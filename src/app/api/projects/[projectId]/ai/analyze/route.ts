import { NextResponse } from "next/server";
import { addDays, endOfDay, format, isValid, parseISO, startOfDay } from "date-fns";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canEditTask } from "@/lib/access";
import { ActivityAction, TaskPriority, TaskStatus } from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { taskDetailInclude } from "@/lib/task-includes";
import {
  extractJsonObject,
  isOpenRouterHttpError,
  openRouterComplete,
} from "@/lib/openrouter";
import { broadcastProjectSync } from "@/lib/project-realtime";
import { coerceAnalyzeOutput, parseLenientJson } from "@/lib/analyze-task-json";

/** 与单次 OpenRouter 超时（8s）+ 解析留余量，避免平台 10s 硬杀导致 502 */
export const maxDuration = 10;

/** OpenRouter chat/completions；analyze 单请求须在约 8s 内结束 */
const OPENROUTER_ANALYZE_TIMEOUT_MS = 8000;

type Ctx = { params: Promise<{ projectId: string }> };

const Body = z.object({
  text: z.string().min(10),
  /** 为 true 时分析结果将直接写入数据库 */
  apply: z.boolean().optional(),
});

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

const ParsedTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  priority: z.enum([TaskPriority.P0, TaskPriority.P1, TaskPriority.P2, TaskPriority.P3]).optional(),
  status: z
    .enum([TaskStatus.TODO, TaskStatus.DOING, TaskStatus.DONE, TaskStatus.BLOCKED])
    .optional(),
  /** 相对「今天」的截止天数；与 dueDateISO 二选一，优先 dueDateISO */
  dueInDays: z.number().min(0).max(3650).nullable().optional(),
  dueDateISO: isoDay,
  /** 开始日期 YYYY-MM-DD；与 startInDays 二选一，优先 startDateISO */
  startDateISO: isoDay,
  /** 相对「今天」的开始日偏移 */
  startInDays: z.number().min(0).max(3650).nullable().optional(),
  /** 主要负责人姓名，须尽量与项目成员列表一致 */
  assigneeName: z.string().nullable().optional(),
  /** 协作人姓名 */
  assistantNames: z.array(z.string()).max(8).optional(),
  /** 甘特进度 0–100，对应任务详情「甘特进度」滑块 */
  progress: z.number().min(0).max(100).nullable().optional(),
});

const OutputSchema = z.object({
  tasks: z.array(ParsedTaskSchema).max(40),
});

/** 将模型输出的 JSON 文本转为结构化任务；失败返回 null（便于触发第二次模型请求） */
function tryParseStructured(rawJson: string): z.infer<typeof OutputSchema> | null {
  try {
    const obj = parseLenientJson(rawJson);
    const coerced = coerceAnalyzeOutput(obj);
    const out = OutputSchema.safeParse(coerced);
    if (!out.success) {
      if (process.env.NODE_ENV === "development") {
        console.error("[ai/analyze] Zod 校验失败:", out.error.flatten());
      }
      return null;
    }
    return out.data;
  } catch (parseErr: unknown) {
    if (process.env.NODE_ENV === "development") {
      console.error("[ai/analyze] JSON 解析失败:", parseErr, rawJson.slice(0, 600));
    }
    return null;
  }
}

type ProjectMemberRow = { userId: string; name: string; email: string };

function buildSystemPrompt(todayISO: string, memberLines: string[]) {
  const list =
    memberLines.length > 0 ?
      memberLines.map((n) => n.trim()).filter(Boolean).join("；")
    : "（当前项目暂无成员，assigneeName / assistantNames 可填 null / []）";

  return `你是项目管理助手。根据用户提供的文本，提取可执行的任务列表。输出字段必须与下方「任务详情页」表单一一对应，便于写入数据库后在同一页面展示：
- 任务名称 → title
- 任务内容说明 → description
- 主要负责人 → assigneeName（姓名或邮箱，须匹配下方成员列表）
- 协助人 → assistantNames（数组，同上）
- 当前状态 → status（TODO / DOING / DONE / BLOCKED）
- 开始日期 → startDateISO 或 startInDays
- 截止日期 → dueDateISO 或 dueInDays
- 优先级 → priority（P0–P3）
- 甘特进度 → progress（0–100 的整数；对应界面进度条）

必须只输出一个 JSON 对象，不要 markdown，不要代码围栏。格式严格如下：
{"tasks":[{"title":"任务标题","description":"补充说明或null","priority":"P0"|"P1"|"P2"|"P3","status":"TODO"|"DOING"|"DONE"|"BLOCKED","dueInDays":数字或null,"dueDateISO":"YYYY-MM-DD或null","startInDays":数字或null,"startDateISO":"YYYY-MM-DD或null","assigneeName":"姓名或邮箱或null","assistantNames":["姓名或邮箱"],"progress":0到100或null}]}

规则：
- 「今天」的日期是 ${todayISO}（YYYY-MM-DD），用于推算 startInDays / dueInDays（相对今天的天数，整数）。
- title：简短明确，对应任务名称。
- description：任务内容、验收要点、交付物、当前完成情况文字（如「已完成30%（600/2000条）」可写在 description；progress 仍尽量单独给出数字）。
- priority：紧急核心 P0，重要 P1，普通 P2，低 P3；默认 P2。
- status：默认 TODO；明确「进行中」填 DOING；已完成填 DONE；阻塞填 BLOCKED。
- 截止日期：优先填 dueDateISO（具体年月日）；若无具体日仅有「N 天内」则填 dueInDays。二者不要矛盾；若同时给出，以 dueDateISO 为准。
- 开始日期：优先 startDateISO；若有「自某月某日起」或日期区间，取区间**首日**为开始日；仅有相对天数则用 startInDays。
- progress：0–100 整数，对应甘特进度。**尽量**从「完成30%」「进度50」「600/2000→约30」等推算；不确定则 null（系统将用默认值）。
- assigneeName：**一名**主要负责人；无则 null。姓名或邮箱必须与下列成员之一对应（优先与列表完全一致；略有出入时改成列表中的标准姓名或邮箱）：
  ${list}
- assistantNames：协作方姓名或邮箱数组；须来自上表；无则 []。不要与 assigneeName 重复。
- 任务数量不超过 25 条，合并重复项。`;
}

function parseIsoDay(s: string | null | undefined): Date | undefined {
  if (s == null || typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return undefined;
  const d = parseISO(t);
  return isValid(d) ? d : undefined;
}

type NormalizedTask = {
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: Date | undefined;
  startDate: Date | undefined;
  assigneeName: string | null;
  assistantNames: string[];
  /** 0–100，undefined 表示不写库（默认 0） */
  progress?: number;
};

function clampProgress(n: unknown): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeParsed(raw: z.infer<typeof ParsedTaskSchema>): NormalizedTask {
  const priority = raw.priority ?? TaskPriority.P2;
  const status = raw.status ?? TaskStatus.TODO;
  const today = new Date();
  const progress = clampProgress(raw.progress ?? undefined);

  let dueDate: Date | undefined;
  const dueFromIso = parseIsoDay(raw.dueDateISO ?? undefined);
  if (dueFromIso) {
    dueDate = endOfDay(dueFromIso);
  } else if (typeof raw.dueInDays === "number" && Number.isFinite(raw.dueInDays)) {
    dueDate = endOfDay(addDays(today, raw.dueInDays));
  }

  let startDate: Date | undefined;
  const startFromIso = parseIsoDay(raw.startDateISO ?? undefined);
  if (startFromIso) {
    startDate = startOfDay(startFromIso);
  } else if (typeof raw.startInDays === "number" && Number.isFinite(raw.startInDays)) {
    startDate = startOfDay(addDays(today, raw.startInDays));
  }

  const assistantNames = Array.isArray(raw.assistantNames)
    ? raw.assistantNames.map((s) => s.trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    title: raw.title.slice(0, 500),
    description: raw.description?.slice(0, 8000) ?? null,
    priority,
    status,
    dueDate,
    startDate,
    assigneeName: raw.assigneeName?.trim() ? raw.assigneeName.trim().slice(0, 120) : null,
    assistantNames,
    ...(progress !== undefined ? { progress } : {}),
  };
}

/** 按姓名或邮箱匹配项目成员（精确优先，其次包含关系） */
function resolveMemberByName(query: string | null | undefined, members: ProjectMemberRow[]): ProjectMemberRow | null {
  if (!query?.trim()) return null;
  const q = query.replace(/负责|牵头|配合|协同/g, "").trim();
  if (!q) return null;

  const qLower = q.toLowerCase();
  if (q.includes("@")) {
    const exactEmail = members.find((m) => m.email.toLowerCase() === qLower);
    if (exactEmail) return exactEmail;
    const emailPartial = members.find(
      (m) =>
        m.email.toLowerCase().includes(qLower) ||
        qLower.includes(m.email.toLowerCase().split("@")[0] ?? ""),
    );
    if (emailPartial) return emailPartial;
  }

  const exact = members.find((m) => m.name === q);
  if (exact) return exact;

  const candidates = members.filter((m) => m.name.includes(q) || q.includes(m.name));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  candidates.sort((a, b) => b.name.length - a.name.length);
  return candidates[0];
}

function resolveAssistantUserIds(
  names: string[],
  assigneeId: string | null,
  members: ProjectMemberRow[],
): string[] {
  const ids: string[] = [];
  for (const n of names) {
    const m = resolveMemberByName(n, members);
    if (!m || m.userId === assigneeId) continue;
    if (!ids.includes(m.userId)) ids.push(m.userId);
  }
  return ids;
}

type PreviewRow = {
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueDate: string | null;
  startDate: string | null;
  progress: number | null;
  assigneeName: string | null;
  assignee: { id: string; name: string } | null;
  assigneeUnresolved: boolean;
  assistants: { id: string; name: string }[];
};

/** OpenRouter 不可用时的示例任务，保证前端表格可渲染 */
function buildMockPreviewRows(): PreviewRow[] {
  return [
    {
      title: "示例任务1",
      description: null,
      priority: TaskPriority.P2,
      status: TaskStatus.TODO,
      dueDate: null,
      startDate: null,
      progress: null,
      assigneeName: null,
      assignee: null,
      assigneeUnresolved: false,
      assistants: [],
    },
    {
      title: "示例任务2",
      description: null,
      priority: TaskPriority.P2,
      status: TaskStatus.TODO,
      dueDate: null,
      startDate: null,
      progress: null,
      assigneeName: null,
      assignee: null,
      assigneeUnresolved: false,
      assistants: [],
    },
  ];
}

function openRouterFailureMessage(e: unknown): string {
  const code =
    e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
  if (code === "MISSING_API_KEY") {
    return "未配置智能服务密钥（OPENROUTER_API_KEY），请联系管理员。";
  }
  if (code === "FETCH_FAILED" || code === "PARSE_ERROR") {
    return "智能服务暂时不可用、响应为空或请求超时，请稍后重试。";
  }
  if (isOpenRouterHttpError(e)) {
    return e.httpStatus === 403 ?
        "内容未能通过智能服务校验，请修改表述后重试。"
      : "智能服务返回错误，请稍后重试。";
  }
  return "智能解析失败，请稍后重试或简化输入内容。";
}

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
  }
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) {
    return NextResponse.json({ success: false, error: "无权访问该项目" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const parsedBody = Body.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ success: false, error: "参数无效", details: parsedBody.error.flatten() }, { status: 400 });
  }

  const apply = parsedBody.data.apply === true;
  if (apply && !canEditTask(access.orgMember.role, access.projectMember.role)) {
    return NextResponse.json({ success: false, error: "无权写入任务" }, { status: 403 });
  }

  const inputText = parsedBody.data.text.slice(0, 32000);
  console.log("[ai/analyze] 输入文本长度:", inputText.length);
  console.log(
    "[ai/analyze] OPENROUTER_MODEL（请求前）:",
    process.env.OPENROUTER_MODEL?.trim() || "(未设置，服务端默认 openai/gpt-4o-mini)",
  );

  const memberRows = await prisma.projectMember.findMany({
    where: { projectId },
    include: { user: { select: { name: true, email: true } } },
  });
  const members: ProjectMemberRow[] = memberRows.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
  }));
  const memberLines = members.map((m) => `${m.name} · ${m.email}`);

  const todayISO = format(new Date(), "yyyy-MM-dd");
  const systemPrompt = buildSystemPrompt(todayISO, memberLines);

  const chatMessages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: inputText },
  ];

  let structured: z.infer<typeof OutputSchema> | null = null;

  try {
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      console.log("[ai/analyze] 错误: OPENROUTER_API_KEY 未设置");
      return NextResponse.json(
        {
          success: false,
          error: openRouterFailureMessage({ code: "MISSING_API_KEY" }),
          tasks: buildMockPreviewRows(),
          fallback: true,
        },
        { status: 200 },
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENROUTER_ANALYZE_TIMEOUT_MS);

    try {
      const { content, rawModel } = await openRouterComplete(chatMessages, {
        temperature: 0.25,
        maxTokens: 4096,
        skipRefusal: true,
        signal: controller.signal,
      });
      console.log(
        "[ai/analyze] 本次 API 实际使用的模型（响应里 model 字段，应与 OPENROUTER 控制台 slug 一致）:",
        rawModel,
      );
      console.log(
        "[ai/analyze] OpenRouter 返回内容长度:",
        content.length,
        "前 400 字:",
        content.slice(0, 400),
      );
      structured = tryParseStructured(extractJsonObject(content));
    } catch (e: unknown) {
      const msg = openRouterFailureMessage(e);
      console.error("[ai/analyze] OpenRouter 请求或解析失败:", e);
      return NextResponse.json(
        {
          success: false,
          error: msg,
          tasks: buildMockPreviewRows(),
          fallback: true,
        },
        { status: 200 },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (structured === null || structured.tasks.length === 0) {
      console.log("[ai/analyze] 模型输出无法解析为任务或任务为空");
      return NextResponse.json(
        {
          success: false,
          error: "未能从文本中解析出有效任务，请换一段更清晰的描述或分段重试。",
          tasks: buildMockPreviewRows(),
          fallback: true,
        },
        { status: 200 },
      );
    }
  } catch (outer: unknown) {
    console.error("[ai/analyze] 未预期错误:", outer);
    return NextResponse.json(
      {
        success: false,
        error: "服务内部错误，已返回示例任务供界面展示。",
        tasks: buildMockPreviewRows(),
        fallback: true,
      },
      { status: 200 },
    );
  }

  const normalized = structured.tasks.map(normalizeParsed);

  function toPreviewRow(t: NormalizedTask) {
    const assignee = resolveMemberByName(t.assigneeName, members);
    const assistantResolved = t.assistantNames
      .map((n) => resolveMemberByName(n, members))
      .filter((x): x is ProjectMemberRow => x != null);
    const assistantDedup: ProjectMemberRow[] = [];
    for (const a of assistantResolved) {
      if (assignee && a.userId === assignee.userId) continue;
      if (assistantDedup.some((x) => x.userId === a.userId)) continue;
      assistantDedup.push(a);
    }

    return {
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate?.toISOString() ?? null,
      startDate: t.startDate?.toISOString() ?? null,
      progress: typeof t.progress === "number" ? t.progress : null,
      assigneeName: t.assigneeName,
      assignee: assignee ? { id: assignee.userId, name: assignee.name } : null,
      assigneeUnresolved: Boolean(t.assigneeName && !assignee),
      assistants: assistantDedup.map((a) => ({ id: a.userId, name: a.name })),
    };
  }

  if (!apply) {
    return NextResponse.json(
      {
        success: true,
        applied: false,
        tasks: normalized.map(toPreviewRow),
      },
      { status: 200 },
    );
  }

  try {
    const maxOrder = await prisma.task.aggregate({
      where: { projectId },
      _max: { sortOrder: true },
    });
    let order = (maxOrder._max.sortOrder ?? 0) + 1;

    const created = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const t of normalized) {
        const assignee = resolveMemberByName(t.assigneeName, members);
        const assistantIds = resolveAssistantUserIds(t.assistantNames, assignee?.userId ?? null, members);

        const task = await tx.task.create({
          data: {
            projectId,
            title: t.title,
            description: t.description,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate ?? null,
            startDate: t.startDate ?? null,
            assigneeId: assignee?.userId ?? null,
            sortOrder: order++,
            ...(typeof t.progress === "number" ? { progress: t.progress } : {}),
            assistants:
              assistantIds.length > 0 ?
                {
                  create: assistantIds.map((userId) => ({ userId })),
                }
              : undefined,
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

    return NextResponse.json(
      {
        success: true,
        applied: true,
        count: created.length,
        tasks: created,
      },
      { status: 200 },
    );
  } catch (dbErr: unknown) {
    console.error("[ai/analyze] 写入数据库失败:", dbErr);
    return NextResponse.json(
      {
        success: false,
        error: "任务写入失败，请稍后重试。",
      },
      { status: 200 },
    );
  }
}
