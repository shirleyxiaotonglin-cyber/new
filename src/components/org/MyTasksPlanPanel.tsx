"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CalendarRange, Loader2, Sparkles } from "lucide-react";

type PlanItem = {
  taskId?: string | null;
  title: string;
  projectName?: string;
  reason?: string;
  suggestedSlot?: string;
  priorityHint?: string;
};

type PlanSection = { title: string; items: PlanItem[] };

type PlanData = {
  summary?: string;
  sections: PlanSection[];
  tips?: string[];
};

export function MyTasksPlanPanel({
  orgId,
  taskProjectHrefByTaskId = {},
}: {
  orgId: string;
  /** 任务 id → 项目页链接，便于计划项跳转 */
  taskProjectHrefByTaskId?: Record<string, string>;
}) {
  const [aiStatus, setAiStatus] = useState<{
    configured: boolean;
    model: string;
    refererSource?: string;
  } | null>(null);
  const [loadingScope, setLoadingScope] = useState<"today" | "week" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayPlan, setTodayPlan] = useState<PlanData | null>(null);
  const [weekPlan, setWeekPlan] = useState<PlanData | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/org/${orgId}/my-tasks/plan`, { credentials: "include" });
      const j = (await res.json()) as {
        configured?: boolean;
        model?: string;
        refererSource?: string;
      };
      if (res.ok) {
        setAiStatus({
          configured: j.configured === true,
          model: typeof j.model === "string" ? j.model : "openai/gpt-4o-mini",
          refererSource: typeof j.refererSource === "string" ? j.refererSource : undefined,
        });
      }
    } catch {
      setAiStatus(null);
    }
  }, [orgId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function generate(scope: "today" | "week") {
    setLoadingScope(scope);
    setError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/my-tasks/plan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const j = (await res.json()) as {
        plan?: PlanData;
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        const msg =
          typeof j.error === "string"
            ? j.error
            : scope === "today"
              ? "生成今日计划失败"
              : "生成本周计划失败";
        setError(msg);
        return;
      }
      if (j.plan) {
        if (scope === "today") setTodayPlan(j.plan);
        else setWeekPlan(j.plan);
      }
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setLoadingScope(null);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-gray-200 bg-gradient-to-b from-red-50/40 to-white px-4 py-6 shadow-sm sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Sparkles className="h-5 w-5 text-red-600" aria-hidden />
            智能计划表
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            根据与您相关的任务列表，自动生成<strong>今日安排</strong>与<strong>本周节奏</strong>建议，便于安排优先级与时间块。
          </p>
          {aiStatus ? (
            <p className="mt-2 text-xs text-gray-500">
              {aiStatus.configured ?
                "智能助手已就绪，可直接点击下方按钮生成。"
              : "智能助手尚未开通，按钮暂不可用。如需使用请联系管理员。"}
            </p>
          ) : (
            <p className="mt-2 text-xs text-gray-400">正在检测…</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loadingScope !== null || aiStatus?.configured === false}
            onClick={() => void generate("today")}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
          >
            {loadingScope === "today" ?
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <CalendarDays className="h-4 w-4" aria-hidden />}
            生成今日计划表
          </button>
          <button
            type="button"
            disabled={loadingScope !== null || aiStatus?.configured === false}
            onClick={() => void generate("week")}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-800 shadow-sm hover:bg-red-50 disabled:opacity-50"
          >
            {loadingScope === "week" ?
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <CalendarRange className="h-4 w-4" aria-hidden />}
            生成本周计划表
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 whitespace-pre-line">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <PlanColumn
          title="今日计划表"
          plan={todayPlan}
          emptyHint="点击上方「生成今日计划表」"
          taskProjectHrefByTaskId={taskProjectHrefByTaskId}
        />
        <PlanColumn
          title="本周计划表"
          plan={weekPlan}
          emptyHint="点击上方「生成本周计划表」"
          taskProjectHrefByTaskId={taskProjectHrefByTaskId}
        />
      </div>
    </section>
  );
}

function PlanColumn({
  title,
  plan,
  emptyHint,
  taskProjectHrefByTaskId,
}: {
  title: string;
  plan: PlanData | null;
  emptyHint: string;
  taskProjectHrefByTaskId: Record<string, string>;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {!plan ? (
        <p className="mt-4 text-center text-sm text-gray-400">{emptyHint}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {plan.summary ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-800">
              {plan.summary}
            </p>
          ) : null}
          {plan.sections.map((sec, i) => (
            <div key={i}>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">{sec.title}</p>
              <ul className="mt-2 space-y-3">
                {sec.items.map((it, j) => {
                  const href =
                    it.taskId && taskProjectHrefByTaskId[it.taskId] ?
                      taskProjectHrefByTaskId[it.taskId]
                    : null;
                  return (
                  <li
                    key={`${it.title}-${j}`}
                    className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-gray-900">
                      {href ?
                        <Link href={href} className="text-red-700 hover:underline">
                          {it.title}
                        </Link>
                      : it.title}
                    </p>
                    {it.projectName ? (
                      <p className="mt-0.5 text-xs text-gray-500">{it.projectName}</p>
                    ) : null}
                    {it.suggestedSlot ? (
                      <p className="mt-1 text-xs text-red-700">建议：{it.suggestedSlot}</p>
                    ) : null}
                    {it.reason ? (
                      <p className="mt-1 text-xs leading-snug text-gray-600">{it.reason}</p>
                    ) : null}
                    {it.priorityHint ? (
                      <span className="mt-1 inline-block rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-500 ring-1 ring-gray-200">
                        {it.priorityHint}
                      </span>
                    ) : null}
                  </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {plan.tips && plan.tips.length > 0 ? (
            <div className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2">
              <p className="text-xs font-medium text-red-800">建议</p>
              <ul className="mt-1 list-inside list-disc text-xs text-red-900/90">
                {plan.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
