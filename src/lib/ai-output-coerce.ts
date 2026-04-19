import { z } from "zod";

function str(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
}

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => str(x)).filter(Boolean);
}

/** 工作报告 JSON：补齐别名键、字符串化，降低模型轻微偏离导致的 422 */
export function coerceReportAiPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  const executiveSummary = str(
    o.executiveSummary ?? o.summary ?? o.executive_summary ?? o["执行摘要"],
  );
  const progressAndCompletionAnalysis = str(
    o.progressAndCompletionAnalysis ??
      o.progress_analysis ??
      o.completionAnalysis ??
      o.analysis ??
      o["进度分析"],
  );
  const taskReviewSanitized = Array.isArray(o.taskReview)
    ? o.taskReview
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          const title = str(r.title);
          if (!title.trim()) return null;
          return {
            taskId:
              r.taskId === null || r.taskId === undefined
                ? null
                : typeof r.taskId === "string"
                  ? r.taskId
                  : String(r.taskId),
            title,
            projectName: r.projectName !== undefined ? str(r.projectName) : undefined,
            status: r.status !== undefined ? str(r.status) : undefined,
            progressNote: r.progressNote !== undefined ? str(r.progressNote) : undefined,
          };
        })
        .filter(Boolean)
    : undefined;

  return {
    reportTitle: o.reportTitle !== undefined ? str(o.reportTitle) : undefined,
    executiveSummary: executiveSummary || "（模型未输出摘要，请重试或缩短任务列表。）",
    keyAchievements:
      o.keyAchievements !== undefined ? stringArray(o.keyAchievements) : undefined,
    progressAndCompletionAnalysis:
      progressAndCompletionAnalysis ||
      "（模型未输出进度分析，请重试或缩短任务列表。）",
    taskReview: taskReviewSanitized,
    risksOrDelays: o.risksOrDelays !== undefined ? stringArray(o.risksOrDelays) : undefined,
    suggestions: o.suggestions !== undefined ? stringArray(o.suggestions) : undefined,
    nextFocus: o.nextFocus !== undefined ? stringArray(o.nextFocus) : undefined,
  };
}

const PlanItemLoose = z.object({
  taskId: z.preprocess(
    (v) => (v == null || v === "" ? null : String(v)),
    z.string().nullable().optional(),
  ),
  title: z.preprocess((v) => (v == null ? "" : String(v)), z.string()),
  projectName: z.string().optional(),
  reason: z.string().optional(),
  suggestedSlot: z.string().optional(),
  priorityHint: z.string().optional(),
});

const PlanSectionLoose = z.object({
  title: z.preprocess((v) => (v == null ? "" : String(v)), z.string()),
  items: z.array(z.unknown()),
});

/** 计划表 JSON：归一 sections / items，忽略无法识别的条目 */
export function coercePlanAiPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  let sectionsRaw: unknown[] = [];
  const sr = o.sections;
  if (Array.isArray(sr)) {
    sectionsRaw = sr;
  } else if (sr && typeof sr === "object") {
    sectionsRaw = Object.values(sr as Record<string, unknown>).filter(
      (x) => x != null && typeof x === "object",
    );
  }

  const sections: unknown[] = [];
  for (const sec of sectionsRaw) {
    const p = PlanSectionLoose.safeParse(sec);
    if (!p.success) continue;
    const itemsIn = Array.isArray(p.data.items) ? p.data.items : [];
    const items: unknown[] = [];
    for (const it of itemsIn) {
      const title =
        it && typeof it === "object" && "title" in (it as object) ?
          str((it as Record<string, unknown>).title)
        : "";
      if (!title.trim()) continue;
      const row = PlanItemLoose.safeParse(it);
      if (row.success) items.push(row.data);
      else items.push({ title: title.trim(), taskId: null });
    }
    sections.push({
      title: p.data.title,
      items,
    });
  }

  return {
    summary: o.summary !== undefined ? str(o.summary) : undefined,
    sections,
    tips: o.tips !== undefined ? stringArray(o.tips) : undefined,
  };
}
