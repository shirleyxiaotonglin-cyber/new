"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/cn";

export type MyTaskListItem = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
};

const STATUS_LABEL: Record<string, string> = {
  [TaskStatus.TODO]: "待办",
  [TaskStatus.DOING]: "进行中",
  [TaskStatus.DONE]: "已完成",
  [TaskStatus.BLOCKED]: "阻塞",
};

type TabKey = "all" | typeof TaskStatus.TODO | typeof TaskStatus.DOING | typeof TaskStatus.DONE | typeof TaskStatus.BLOCKED | "calendar";

const LIST_TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: TaskStatus.TODO, label: "待办" },
  { key: TaskStatus.DOING, label: "进行中" },
  { key: TaskStatus.DONE, label: "已完成" },
  { key: TaskStatus.BLOCKED, label: "阻塞" },
  { key: "calendar", label: "日历" },
];

function dueOnDay(due: string | null, day: Date): boolean {
  if (!due) return false;
  try {
    const d = parseISO(due);
    return isSameDay(d, day);
  } catch {
    return false;
  }
}

function MonthCalendar({
  tasks,
  orgId,
}: {
  tasks: MyTaskListItem[];
  orgId: string;
}) {
  const [cursorMonth, setCursorMonth] = useState(() => startOfMonth(new Date()));

  const grid = useMemo(() => {
    const monthStart = startOfMonth(cursorMonth);
    const monthEnd = endOfMonth(cursorMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [cursorMonth]);

  const undated = useMemo(() => tasks.filter((t) => !t.dueDate), [tasks]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          按<strong className="font-medium text-gray-800">截止日期</strong>
          落在当月格子内；点击任务进入项目并打开该任务详情。
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="上一月"
            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
            onClick={() => setCursorMonth((d) => startOfMonth(subMonths(d, 1)))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-gray-900">
            {format(cursorMonth, "yyyy 年 M 月")}
          </span>
          <button
            type="button"
            aria-label="下一月"
            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
            onClick={() => setCursorMonth((d) => startOfMonth(addMonths(d, 1)))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid min-w-[720px] grid-cols-7 gap-px bg-gray-200">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
            <div key={d} className="bg-gray-50 py-2 text-center text-xs font-medium text-gray-500">
              {d}
            </div>
          ))}
          {grid.map((day) => {
            const inMonth = isSameMonth(day, cursorMonth);
            const dayTasks = tasks.filter((t) => t.dueDate && dueOnDay(t.dueDate, day));
            return (
              <div
                key={format(day, "yyyy-MM-dd")}
                className={cn(
                  "min-h-[88px] bg-white p-1.5 text-left",
                  !inMonth && "bg-gray-50/80 text-gray-400",
                )}
              >
                <span className={cn("text-[11px] font-medium", inMonth ? "text-gray-700" : "text-gray-400")}>
                  {format(day, "d")}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.map((dt) => (
                    <Link
                      key={dt.id}
                      href={`/org/${orgId}/project/${dt.projectId}?task=${encodeURIComponent(dt.id)}`}
                      className="block truncate rounded bg-red-50 px-1 py-0.5 text-[10px] font-medium text-red-800 ring-1 ring-red-100 hover:bg-red-100"
                      title={`${dt.title} · ${dt.projectName}`}
                    >
                      {dt.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 ?
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-3">
          <p className="text-xs font-medium text-gray-600">未设置截止日期（{undated.length}）</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {undated.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/org/${orgId}/project/${t.projectId}?task=${encodeURIComponent(t.id)}`}
                  className="inline-flex max-w-[220px] items-center truncate rounded-full bg-white px-2.5 py-1 text-xs text-gray-800 ring-1 ring-gray-200 hover:ring-red-200"
                  title={t.projectName}
                >
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      : null}
    </div>
  );
}

export function MyTasksBoard({ orgId, tasks }: { orgId: string; tasks: MyTaskListItem[] }) {
  const [tab, setTab] = useState<TabKey>("all");

  const filtered = useMemo(() => {
    if (tab === "all" || tab === "calendar") return tasks;
    return tasks.filter((t) => t.status === tab);
  }, [tasks, tab]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      [TaskStatus.TODO]: tasks.filter((t) => t.status === TaskStatus.TODO).length,
      [TaskStatus.DOING]: tasks.filter((t) => t.status === TaskStatus.DOING).length,
      [TaskStatus.DONE]: tasks.filter((t) => t.status === TaskStatus.DONE).length,
      [TaskStatus.BLOCKED]: tasks.filter((t) => t.status === TaskStatus.BLOCKED).length,
    }),
    [tasks],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="flex flex-wrap gap-2 border-b border-gray-100 pb-4" aria-label="任务视图">
        {LIST_TABS.map(({ key, label }) => {
          const count =
            key === "calendar" ? null : key === "all" ? counts.all : counts[key] ?? 0;
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-red-600 text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
              )}
            >
              {key === "calendar" ?
                <CalendarDays className="h-3.5 w-3.5" aria-hidden />
              : null}
              {label}
              {count !== null ?
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-[10px]",
                    active ? "bg-red-500 text-white" : "bg-white text-gray-500 ring-1 ring-gray-200",
                  )}
                >
                  {count}
                </span>
              : null}
            </button>
          );
        })}
      </nav>

      {tab === "calendar" ?
        <div className="mt-6">
          <MonthCalendar tasks={tasks} orgId={orgId} />
        </div>
      : filtered.length === 0 ?
        <p className="mt-10 text-center text-sm text-gray-500">
          {tasks.length === 0 ? "暂无分配给你的任务。" : "当前分类下没有任务。"}
        </p>
      : (
        <ul className="mt-6 space-y-2">
          {filtered.map((t) => (
            <li key={t.id}>
              <Link
                href={`/org/${orgId}/project/${t.projectId}?task=${encodeURIComponent(t.id)}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 transition-colors hover:border-red-200 hover:bg-red-50/30"
              >
                <span className="font-medium text-gray-900">{t.title}</span>
                <span className="text-sm text-gray-500">{t.projectName}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                <span className="text-xs text-gray-400">
                  {t.dueDate ? format(parseISO(t.dueDate), "yyyy-MM-dd") : "无截止日"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
