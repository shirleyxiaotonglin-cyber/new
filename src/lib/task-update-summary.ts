import type { Task } from "@prisma/client";

type TaskAfter = Task & {
  assignee?: { id: string; name: string } | null;
  assistants?: { user: { id: string; name: string } }[];
};

const STATUS_LABEL: Record<string, string> = {
  TODO: "待办",
  DOING: "进行中",
  DONE: "已完成",
  BLOCKED: "阻塞",
};

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "（空）";
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return "（空）";
  }
}

function sameInstant(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.getTime() === b.getTime();
}

/** 用于写入 Activity.meta（新格式含 summaryLines） */
export function buildTaskUpdateSummaryLines(
  before: Task,
  after: TaskAfter,
  assistantIdsBefore: string[],
): string[] {
  const lines: string[] = [];

  if (before.title !== after.title) {
    lines.push(`将标题改为「${clip(after.title, 80)}」`);
  }
  const bd = before.description ?? "";
  const ad = after.description ?? "";
  if (bd !== ad) {
    if (!ad) lines.push("清空了任务内容");
    else if (!bd) lines.push(`补充了任务内容（${clip(ad, 40)}）`);
    else lines.push(`修改了任务内容（${clip(ad, 40)}）`);
  }
  if (before.status !== after.status) {
    lines.push(
      `状态：${STATUS_LABEL[before.status] ?? before.status} → ${STATUS_LABEL[after.status] ?? after.status}`,
    );
  }
  if (before.priority !== after.priority) {
    lines.push(`优先级：${before.priority} → ${after.priority}`);
  }
  if (Math.round(Number(before.progress)) !== Math.round(Number(after.progress))) {
    lines.push(
      `进度：${Math.round(Number(before.progress))}% → ${Math.round(Number(after.progress))}%`,
    );
  }
  if (before.assigneeId !== after.assigneeId) {
    const name = after.assignee?.name ?? "未指定";
    lines.push(`负责人调整为「${name}」`);
  }

  const afterAssist = (after.assistants ?? []).map((a) => a.user.id).sort();
  const beforeSorted = [...assistantIdsBefore].sort();
  const assistSame =
    afterAssist.length === beforeSorted.length &&
    afterAssist.every((id, i) => id === beforeSorted[i]);
  if (!assistSame) {
    const names = (after.assistants ?? []).map((a) => a.user.name);
    lines.push(names.length ? `协作人现为：${names.join("、")}` : "移除了全部协作人");
  }

  if (!sameInstant(before.dueDate ?? null, after.dueDate ?? null)) {
    lines.push(`截止日期：${fmtDate(before.dueDate)} → ${fmtDate(after.dueDate)}`);
  }
  if (!sameInstant(before.startDate ?? null, after.startDate ?? null)) {
    lines.push(`开始日期：${fmtDate(before.startDate)} → ${fmtDate(after.startDate)}`);
  }

  if (lines.length === 0) {
    lines.push("更新了任务");
  }
  return lines;
}

type MetaPayload = {
  summaryLines?: string[];
  title?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

const ACTION_FALLBACK: Record<string, string> = {
  TASK_CREATED: "创建任务",
  TASK_UPDATED: "更新任务",
  TASK_STATUS: "更新状态",
  TASK_ASSIGNED: "分配任务",
  COMMENT_ADDED: "发表评论",
  FILE_UPLOADED: "上传文件",
};

function coerceTaskFromJson(raw: Record<string, unknown>): Task {
  const c = { ...raw } as Record<string, unknown>;
  for (const key of ["dueDate", "startDate", "createdAt", "updatedAt"] as const) {
    const v = c[key];
    if (typeof v === "string" || v instanceof Date) {
      c[key] = v ? new Date(String(v)) : null;
    }
  }
  return c as unknown as Task;
}

function coerceAfterFromJson(raw: Record<string, unknown>): TaskAfter {
  const t = coerceTaskFromJson(raw);
  const assignee = raw.assignee;
  const assistants = raw.assistants;
  return {
    ...t,
    assignee:
      assignee && typeof assignee === "object" && assignee !== null
        ? (assignee as { id: string; name: string })
        : null,
    assistants: Array.isArray(assistants) ? (assistants as TaskAfter["assistants"]) : undefined,
  };
}

/** 解析活动文案：新 summaryLines、旧 meta、或仅 action */
export function formatActivityDescription(action: string, meta: string | null): string {
  if (meta) {
    try {
      const o = JSON.parse(meta) as MetaPayload;
      if (Array.isArray(o.summaryLines) && o.summaryLines.length > 0) {
        return o.summaryLines.join("；");
      }
      if (typeof o.title === "string" && action === "TASK_CREATED") {
        return `创建任务「${clip(o.title, 100)}」`;
      }
      if (o.before && o.after && typeof o.before === "object" && typeof o.after === "object") {
        const before = coerceTaskFromJson(o.before as Record<string, unknown>);
        const after = coerceAfterFromJson(o.after as Record<string, unknown>);
        const lines = buildTaskUpdateSummaryLines(before, after, []);
        return lines.join("；");
      }
    } catch {
      /* ignore */
    }
  }
  return ACTION_FALLBACK[action] ?? action;
}
