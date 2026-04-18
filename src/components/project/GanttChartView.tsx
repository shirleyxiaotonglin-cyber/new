"use client";

import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Minus, Plus } from "lucide-react";
import { TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/cn";

export type GanttTask = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  progress?: number | null;
};

const DAY_MS = 86400000;

/** 与参考图一致的蓝系配色（甘特条与品牌红区分） */
const BAR_TOTAL = "#bfdbfe";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** 自然日跨度，支持 0.5 日粒度展示 */
export function calendarDaySpan(start: Date, end: Date): number {
  const s = startOfDay(start).getTime();
  const e = startOfDay(end).getTime();
  const raw = (e - s) / DAY_MS;
  return Math.max(0.5, Math.round(raw * 2) / 2);
}

function effectiveProgress(t: GanttTask): number {
  const p = t.progress ?? 0;
  if (p > 0) return Math.min(100, p);
  if (t.status === TaskStatus.DONE) return 100;
  if (t.status === TaskStatus.DOING) return 45;
  return 0;
}

function buildMonthSegments(dates: Date[]) {
  const segments: { key: string; label: string; span: number }[] = [];
  for (const d of dates) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = format(d, "yyyy-MM");
    const last = segments[segments.length - 1];
    if (last && last.key === key) last.span += 1;
    else segments.push({ key, label, span: 1 });
  }
  return segments;
}

function eachDayInclusive(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  const d = startOfDay(start);
  const last = startOfDay(end);
  while (d <= last) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

type Props = {
  tasks: GanttTask[];
  onRowClick?: (task: GanttTask) => void;
};

export function GanttChartView({ tasks, onRowClick }: Props) {
  const [pxPerDay, setPxPerDay] = useState(18);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { rangeStart, days, timelineWidth, rows } = useMemo(() => {
    const normalized: {
      task: GanttTask;
      start: Date;
      end: Date;
      duration: number;
    }[] = [];

    const anchor = startOfDay(new Date());

    for (const t of tasks) {
      let start: Date;
      let end: Date;
      if (t.startDate && t.dueDate) {
        start = new Date(t.startDate);
        end = new Date(t.dueDate);
      } else if (t.dueDate) {
        end = new Date(t.dueDate);
        start = new Date(end.getTime() - 3 * DAY_MS);
      } else if (t.startDate) {
        start = new Date(t.startDate);
        end = new Date(start.getTime() + 3 * DAY_MS);
      } else {
        start = new Date(anchor);
        end = new Date(anchor.getTime() + 3 * DAY_MS);
      }
      if (end < start) {
        const x = start;
        start = end;
        end = x;
      }
      const duration = calendarDaySpan(start, end);
      normalized.push({ task: t, start, end, duration });
    }

    let rangeS = anchor;
    let rangeE = new Date(anchor.getTime() + 14 * DAY_MS);
    for (const r of normalized) {
      if (r.start < rangeS) rangeS = r.start;
      if (r.end > rangeE) rangeE = r.end;
    }
    rangeS = startOfDay(new Date(rangeS.getTime() - 2 * DAY_MS));
    rangeE = startOfDay(new Date(rangeE.getTime() + 2 * DAY_MS));
    if (rangeS.getTime() > rangeE.getTime()) {
      const tmp = rangeS;
      rangeS = rangeE;
      rangeE = tmp;
    }

    const dayList = eachDayInclusive(rangeS, rangeE);
    const tw = Math.max(dayList.length * pxPerDay, 320);

    return {
      rangeStart: rangeS,
      days: dayList,
      timelineWidth: tw,
      rows: normalized,
    };
  }, [tasks, pxPerDay]);

  const monthSegments = useMemo(() => buildMonthSegments(days), [days]);

  const rangeStartMs = rangeStart.getTime();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <p>
          左侧为任务属性表，右侧为日历时间轴；支持横向滚动查看长周期；进度条深色为「已完成比例」。
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">缩放</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => setPxPerDay((v) => Math.max(8, v - 2))}
            aria-label="缩小"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3ch] text-center text-xs tabular-nums">{pxPerDay}px/日</span>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => setPxPerDay((v) => Math.min(40, v + 2))}
            aria-label="放大"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[min(70vh,720px)] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="flex min-w-min min-h-min">
          {/* 左侧固定列表 */}
          <div
            className="sticky left-0 z-[25] flex w-[min(100%,440px)] shrink-0 flex-col border-r border-slate-200 bg-white shadow-[4px_0_12px_rgba(15,23,42,0.06)] sm:w-[440px]"
          >
            <div className="sticky top-0 z-[35] grid grid-cols-[40px_1fr_88px_88px_72px] border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              <div className="flex items-end border-r border-slate-200 px-1.5 py-2 text-center">ID</div>
              <div className="flex items-end border-r border-slate-200 px-2 py-2">任务名称</div>
              <div className="flex items-end justify-center border-r border-slate-200 px-1 py-2">
                开始日期
              </div>
              <div className="flex items-end justify-center border-r border-slate-200 px-1 py-2">
                结束日期
              </div>
              <div className="flex items-end justify-center px-1 py-2">持续</div>
            </div>

            {rows.map(({ task, start, end, duration }, idx) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onRowClick?.(task)}
                className={cn(
                  "grid w-full grid-cols-[40px_1fr_88px_88px_72px] border-b border-slate-100 text-left text-[12px] transition hover:bg-blue-50/80",
                  idx % 2 === 1 ? "bg-slate-50/90" : "bg-white",
                )}
              >
                <div className="flex items-center justify-center border-r border-slate-100 px-1 font-mono text-slate-500 tabular-nums">
                  {idx + 1}
                </div>
                <div className="truncate border-r border-slate-100 px-2 py-2 font-medium text-slate-900">
                  {task.title}
                </div>
                <div className="flex items-center justify-center border-r border-slate-100 px-1 text-center text-slate-700 tabular-nums">
                  {format(startOfDay(start), "yyyy-MM-dd")}
                </div>
                <div className="flex items-center justify-center border-r border-slate-100 px-1 text-center text-slate-700 tabular-nums">
                  {format(startOfDay(end), "yyyy-MM-dd")}
                </div>
                <div className="flex items-center justify-end px-2 py-2 text-slate-600 tabular-nums">
                  {duration.toFixed(1)} 日
                </div>
              </button>
            ))}
          </div>

          {/* 右侧时间轴 */}
          <div className="min-w-0 flex flex-col" style={{ width: timelineWidth }}>
            <div className="sticky top-0 z-[30] bg-slate-100 shadow-sm">
              <div className="flex border-b border-slate-200">
                {monthSegments.map((s, mi) => (
                  <div
                    key={`${s.key}-${mi}`}
                    style={{ width: s.span * pxPerDay, minWidth: s.span * pxPerDay }}
                    className="border-r border-slate-200 px-1 py-1 text-center text-[11px] font-medium text-slate-700 last:border-r-0"
                  >
                    {s.label}
                  </div>
                ))}
              </div>
              <div className="flex border-b border-slate-200">
                {days.map((d) => (
                  <div
                    key={d.getTime()}
                    style={{ width: pxPerDay, minWidth: pxPerDay }}
                    className="border-r border-slate-100 py-1 text-center text-[10px] text-slate-500 last:border-r-0"
                  >
                    {d.getDate()}
                  </div>
                ))}
              </div>
            </div>

            {rows.map(({ task, start, end }, idx) => {
              const startRel = (startOfDay(start).getTime() - rangeStartMs) / DAY_MS;
              const span = calendarDaySpan(start, end);
              const leftPx = startRel * pxPerDay;
              const barW = span * pxPerDay;
              const prog = effectiveProgress(task);
              const fillRatio = Math.min(1, prog / 100);

              return (
                <div
                  key={task.id}
                  className={cn(
                    "relative h-[42px] flex-shrink-0 border-b border-slate-100",
                    idx % 2 === 1 ? "bg-slate-50/90" : "bg-white",
                  )}
                  style={{ width: timelineWidth }}
                >
                  <div className="absolute inset-0 flex">
                    {days.map((d) => (
                      <div
                        key={d.getTime()}
                        style={{ width: pxPerDay, minWidth: pxPerDay }}
                        className="border-r border-slate-100/90 last:border-r-0"
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="absolute inset-y-0 left-0 w-full cursor-pointer"
                    style={{ paddingLeft: 0 }}
                    onClick={() => onRowClick?.(task)}
                    aria-label={`打开任务 ${task.title}`}
                  />
                  <div
                    className="pointer-events-none absolute top-1/2 z-[1] h-[22px] -translate-y-1/2 rounded-sm shadow-sm"
                    style={{
                      left: leftPx,
                      width: Math.max(barW, 4),
                      background: BAR_TOTAL,
                    }}
                  >
                    <div
                      className="h-full rounded-l-sm bg-gradient-to-b from-blue-600 to-blue-700"
                      style={{ width: `${fillRatio * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded-sm bg-gradient-to-b from-blue-600 to-blue-700" />
          已完成进度
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-6 rounded-sm bg-blue-200" />
          计划剩余
        </span>
      </div>
    </div>
  );
}
