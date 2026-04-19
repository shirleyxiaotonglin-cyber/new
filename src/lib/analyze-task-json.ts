import { format, isValid, parseISO } from "date-fns";
import { TaskPriority, TaskStatus } from "@/lib/constants";

/** 尝试解析模型输出的 JSON（容忍末尾多余逗号等常见问题） */
export function parseLenientJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    try {
      const noTrailingCommas = t.replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(noTrailingCommas);
    } catch {
      throw new SyntaxError("Invalid JSON");
    }
  }
}

function normalizePriorityValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return TaskPriority.P2;
  const raw = String(v).trim();
  const u = raw.toUpperCase();
  if (u === "P0" || u === "P1" || u === "P2" || u === "P3") return u;
  const low = raw.toLowerCase();
  if (/^(p0|紧急|最高|critical)/i.test(low)) return TaskPriority.P0;
  if (/^(p1|高优|重要)/i.test(low)) return TaskPriority.P1;
  if (/^(p3|低优|低优先级)/i.test(low)) return TaskPriority.P3;
  return TaskPriority.P2;
}

function normalizeStatusValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return TaskStatus.TODO;
  const raw = String(v).trim();
  const u = raw.toUpperCase();
  if (
    u === TaskStatus.TODO ||
    u === TaskStatus.DOING ||
    u === TaskStatus.DONE ||
    u === TaskStatus.BLOCKED
  ) {
    return u;
  }
  const t = raw;
  if (/完成|done|已完成|已结束/i.test(t)) return TaskStatus.DONE;
  if (/进行|doing|进行中|处理中/i.test(t)) return TaskStatus.DOING;
  if (/阻塞|blocked|卡住|风险/i.test(t)) return TaskStatus.BLOCKED;
  if (/待办|todo|未开始|待处理|排队/i.test(t)) return TaskStatus.TODO;
  return TaskStatus.TODO;
}

function normalizeDateField(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") return undefined;
  const d = parseISO(v.trim());
  if (!isValid(d)) return undefined;
  return format(d, "yyyy-MM-dd");
}

function coerceNumericField(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(/%/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function coerceTaskRaw(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const titleRaw = o.title;
  const title =
    typeof titleRaw === "string" ?
      titleRaw.trim()
    : titleRaw !== undefined && titleRaw !== null ?
      String(titleRaw).trim()
    : "";
  if (!title) return null;

  const out: Record<string, unknown> = { ...o, title: title.slice(0, 500) };

  if (typeof o.description === "number") {
    out.description = String(o.description);
  } else if (o.description !== undefined && o.description !== null && typeof o.description !== "string") {
    out.description = String(o.description).slice(0, 8000);
  }

  out.priority = normalizePriorityValue(o.priority);
  out.status = normalizeStatusValue(o.status);

  let dueIn = coerceNumericField(o.dueInDays);
  if (typeof dueIn === "number") {
    dueIn = Math.min(3650, Math.max(0, Math.round(dueIn)));
    out.dueInDays = dueIn;
  }

  let startIn = coerceNumericField(o.startInDays);
  if (typeof startIn === "number") {
    startIn = Math.min(3650, Math.max(0, Math.round(startIn)));
    out.startInDays = startIn;
  }

  const progRaw = coerceNumericField(o.progress);
  if (typeof progRaw === "number") {
    out.progress = Math.min(100, Math.max(0, Math.round(progRaw)));
  }

  out.dueDateISO = normalizeDateField(o.dueDateISO);
  out.startDateISO = normalizeDateField(o.startDateISO);

  if (typeof o.assistantNames === "string") {
    out.assistantNames = o.assistantNames
      .split(/[,，、;；]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  } else if (Array.isArray(o.assistantNames)) {
    out.assistantNames = o.assistantNames
      .map((x) => (typeof x === "string" ? x.trim() : String(x)))
      .filter(Boolean)
      .slice(0, 8);
  }

  if (o.assigneeName !== undefined && o.assigneeName !== null && typeof o.assigneeName !== "string") {
    out.assigneeName = String(o.assigneeName).trim() || null;
  }

  return out;
}

/**
 * 将模型输出的任意合理结构归一成 `{ tasks: [...] }`，并修正枚举、数字、日期格式，
 * 降低因轻微格式偏差导致的解析失败。
 */
export function coerceAnalyzeOutput(parsed: unknown): { tasks: unknown[] } {
  let tasks: unknown[] = [];

  if (parsed === null || parsed === undefined) {
    return { tasks: [] };
  }

  if (Array.isArray(parsed)) {
    tasks = parsed;
  } else if (typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (Array.isArray(o.tasks)) {
      tasks = o.tasks;
    } else if (Array.isArray(o.taskList)) {
      tasks = o.taskList;
    } else if (Array.isArray(o.items)) {
      tasks = o.items;
    } else if (Array.isArray(o.data)) {
      tasks = o.data;
    }
  }

  const cleaned = tasks
    .map(coerceTaskRaw)
    .filter((x): x is Record<string, unknown> => x != null);

  return { tasks: cleaned };
}
