"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Target,
} from "lucide-react";

type ReportData = {
  reportTitle?: string;
  executiveSummary: string;
  keyAchievements?: string[];
  progressAndCompletionAnalysis: string;
  taskReview?: Array<{
    taskId?: string | null;
    title: string;
    projectName?: string;
    status?: string;
    progressNote?: string;
  }>;
  risksOrDelays?: string[];
  suggestions?: string[];
  nextFocus?: string[];
};

export function WorkReportsAiPanel({
  orgId,
  taskProjectHrefByTaskId,
}: {
  orgId: string;
  taskProjectHrefByTaskId: Record<string, string>;
}) {
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    model: string;
  } | null>(null);
  const [loadingScope, setLoadingScope] = useState<"today" | "week" | "month" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [todayReport, setTodayReport] = useState<ReportData | null>(null);
  const [weekReport, setWeekReport] = useState<ReportData | null>(null);
  const [monthReport, setMonthReport] = useState<ReportData | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/reports/ai`, { credentials: "include" });
      const j = (await res.json()) as { configured?: boolean; model?: string };
      if (res.ok) {
        setAiStatus({
          configured: j.configured === true,
          model: typeof j.model === "string" ? j.model : "openai/gpt-4o-mini",
        });
      }
    } catch {
      setAiStatus(null);
    }
  }, [orgId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function generate(scope: "today" | "week" | "month") {
    setLoadingScope(scope);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/reports/ai`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const j = (await res.json()) as { report?: ReportData; error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "生成失败");
        return;
      }
      if (j.report) {
        if (scope === "today") setTodayReport(j.report);
        else if (scope === "week") setWeekReport(j.report);
        else setMonthReport(j.report);
      }
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoadingScope(null);
    }
  }

  return (
    <section className="mt-10 space-y-8">
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-b from-slate-50 to-white px-4 py-6 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Sparkles className="h-5 w-5 text-red-600" aria-hidden />
              AI 工作报告（OpenRouter）
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-600">
              基于当前组织内「分配给你」的任务数据，自动分析进度与完成情况，生成今日 / 本周 /
              本月工作报告。需配置环境变量{" "}
              <code className="rounded bg-gray-100 px-1 text-xs">OPENROUTER_API_KEY</code>。
            </p>
            {aiStatus ? (
              <p className="mt-2 text-xs text-gray-500">
                {aiStatus.configured ?
                  <>
                    已就绪 · 模型 <span className="font-mono text-gray-700">{aiStatus.model}</span>
                  </>
                : "未检测到 API Key，生成按钮将不可用。"}
              </p>
            ) : (
              <p className="mt-2 text-xs text-gray-400">正在检测配置…</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <GenButton
              label="今日工作报告"
              icon={<CalendarDays className="h-4 w-4" />}
              loading={loadingScope === "today"}
              disabled={loadingScope !== null || aiStatus?.configured === false}
              onClick={() => void generate("today")}
              primary
            />
            <GenButton
              label="本周工作报告"
              icon={<FileText className="h-4 w-4" />}
              loading={loadingScope === "week"}
              disabled={loadingScope !== null || aiStatus?.configured === false}
              onClick={() => void generate("week")}
            />
            <GenButton
              label="本月工作报告"
              icon={<CalendarRange className="h-4 w-4" />}
              loading={loadingScope === "month"}
              disabled={loadingScope !== null || aiStatus?.configured === false}
              onClick={() => void generate("month")}
            />
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 whitespace-pre-line">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-8 xl:grid-cols-3">
        <ReportCard
          title="今日工作报告"
          report={todayReport}
          emptyHint="点击「今日工作报告」生成"
          taskProjectHrefByTaskId={taskProjectHrefByTaskId}
        />
        <ReportCard
          title="本周工作报告"
          report={weekReport}
          emptyHint="点击「本周工作报告」生成"
          taskProjectHrefByTaskId={taskProjectHrefByTaskId}
        />
        <ReportCard
          title="本月工作报告"
          report={monthReport}
          emptyHint="点击「本月工作报告」生成"
          taskProjectHrefByTaskId={taskProjectHrefByTaskId}
        />
      </div>
    </section>
  );
}

function GenButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
  primary,
}: {
  label: string;
  icon: ReactNode;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        primary ?
          "inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
        : "inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50"
      }
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {label}
    </button>
  );
}

function ReportCard({
  title,
  report,
  emptyHint,
  taskProjectHrefByTaskId,
}: {
  title: string;
  report: ReportData | null;
  emptyHint: string;
  taskProjectHrefByTaskId: Record<string, string>;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="flex min-h-[280px] flex-1 flex-col p-4">
        {!report ? (
          <p className="flex flex-1 items-center justify-center text-center text-sm text-gray-400">
            {emptyHint}
          </p>
        ) : (
          <div className="space-y-4 text-sm">
            {report.reportTitle ? (
              <p className="text-base font-semibold text-gray-900">{report.reportTitle}</p>
            ) : null}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">摘要</p>
              <p className="mt-1 leading-relaxed text-gray-800">{report.executiveSummary}</p>
            </div>

            {report.keyAchievements && report.keyAchievements.length > 0 ? (
              <div>
                <p className="flex items-center gap-1 text-xs font-medium text-green-700">
                  <Target className="h-3.5 w-3.5" aria-hidden />
                  亮点 / 成果
                </p>
                <ul className="mt-1 list-inside list-disc text-gray-700">
                  {report.keyAchievements.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                进度与完成情况分析
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-gray-800">
                {report.progressAndCompletionAnalysis}
              </p>
            </div>

            {report.taskReview && report.taskReview.length > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  任务点评（择要）
                </p>
                <ul className="mt-2 space-y-2">
                  {report.taskReview.map((t, i) => {
                    const href =
                      t.taskId && taskProjectHrefByTaskId[t.taskId] ?
                        taskProjectHrefByTaskId[t.taskId]
                      : null;
                    return (
                      <li
                        key={`${t.title}-${i}`}
                        className="rounded-lg border border-gray-100 bg-gray-50/90 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-gray-900">
                            {href ?
                              <Link href={href} className="text-red-700 hover:underline">
                                {t.title}
                              </Link>
                            : t.title}
                          </span>
                          {t.status ?
                            <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-600 ring-1 ring-gray-200">
                              {t.status}
                            </span>
                          : null}
                        </div>
                        {t.projectName ?
                          <p className="mt-0.5 text-xs text-gray-500">{t.projectName}</p>
                        : null}
                        {t.progressNote ?
                          <p className="mt-1 text-xs leading-snug text-gray-600">{t.progressNote}</p>
                        : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {report.risksOrDelays && report.risksOrDelays.length > 0 ? (
              <div>
                <p className="flex items-center gap-1 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                  风险 / 延期
                </p>
                <ul className="mt-1 list-inside list-disc text-gray-700">
                  {report.risksOrDelays.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {report.suggestions && report.suggestions.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-gray-500">建议</p>
                <ul className="mt-1 list-inside list-disc text-gray-700">
                  {report.suggestions.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {report.nextFocus && report.nextFocus.length > 0 ? (
              <div className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2">
                <p className="text-xs font-medium text-red-900">后续关注</p>
                <ul className="mt-1 space-y-1">
                  {report.nextFocus.map((x, i) => (
                    <li key={i} className="flex gap-1 text-xs text-red-900/90">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 translate-y-0.5" aria-hidden />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
