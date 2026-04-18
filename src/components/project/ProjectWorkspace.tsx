"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
} from "@dnd-kit/core";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Columns3,
  GanttChart as GanttIcon,
  LayoutList,
  Loader2,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/cn";
import { TaskStatus, TaskPriority } from "@/lib/constants";
import { GanttChartView } from "@/components/project/GanttChartView";
import { useProjectRealtime } from "@/hooks/useProjectRealtime";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  progress?: number | null;
  assignee: { id: string; name: string } | null;
  tags: { tag: { id: string; name: string; color: string } }[];
  dependenciesPredecessors: {
    predecessor: { id: string; title: string; status: string };
  }[];
  subtasks: { id: string; title: string; status: string }[];
  assistants?: { user: { id: string; name: string; email?: string | null } }[];
};

function normalizeTaskRow(t: TaskRow): TaskRow {
  return {
    ...t,
    assistants: Array.isArray(t.assistants) ? t.assistants : [],
    dependenciesPredecessors: Array.isArray(t.dependenciesPredecessors)
      ? t.dependenciesPredecessors
      : [],
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    tags: Array.isArray(t.tags) ? t.tags : [],
  };
}

type ProjectMemberOption = {
  userId: string;
  user: { id: string; name: string; email: string };
};

type View = "board" | "list" | "timeline" | "gantt" | "calendar" | "dashboard" | "activity";

type AnalyticsBundle = {
  summary: {
    total: number;
    completionRate: number;
    overdueCount: number;
    byStatus: Record<string, number>;
  };
  workload?: Record<string, number>;
};

type ActivityRow = {
  id: string;
  action: string;
  createdAt: string;
  task: { title: string } | null;
  user: { name: string } | null;
};

function parseAnalytics(raw: Record<string, unknown>): AnalyticsBundle | null {
  const s = raw.summary;
  if (!s || typeof s !== "object") return null;
  const sum = s as Record<string, unknown>;
  if (
    typeof sum.total !== "number" ||
    typeof sum.completionRate !== "number" ||
    typeof sum.overdueCount !== "number" ||
    typeof sum.byStatus !== "object" ||
    sum.byStatus === null
  ) {
    return null;
  }
  const out: AnalyticsBundle = {
    summary: {
      total: sum.total,
      completionRate: sum.completionRate,
      overdueCount: sum.overdueCount,
      byStatus: sum.byStatus as Record<string, number>,
    },
  };
  if (raw.workload && typeof raw.workload === "object") {
    out.workload = raw.workload as Record<string, number>;
  }
  return out;
}

const STATUSES = [
  TaskStatus.TODO,
  TaskStatus.DOING,
  TaskStatus.DONE,
  TaskStatus.BLOCKED,
] as const;

const STATUS_LABEL: Record<string, string> = {
  [TaskStatus.TODO]: "待办",
  [TaskStatus.DOING]: "进行中",
  [TaskStatus.DONE]: "已完成",
  [TaskStatus.BLOCKED]: "阻塞",
};

function DraggableTaskCard({
  task,
  onOpen,
}: {
  task: TaskRow;
  onOpen: (t: TaskRow) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm",
        isDragging && "opacity-40 ring-2 ring-red-400",
      )}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onOpen(task)}
        {...attributes}
        {...listeners}
      >
        <p className="text-sm font-medium text-gray-900">{task.title}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700">
            {task.priority}
          </span>
          {task.tags?.slice(0, 2).map((tt) => (
            <span
              key={tt.tag.id}
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: tt.tag.color + "40", color: "#e4e4e7" }}
            >
              {tt.tag.name}
            </span>
          ))}
        </div>
      </button>
    </div>
  );
}

function KanbanColumn({
  status,
  count,
  children,
}: {
  status: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[240px] flex-col rounded-xl border border-gray-200 bg-gray-50/80",
        isOver && "ring-2 ring-red-300",
      )}
    >
      <div className="border-b border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800">
        {STATUS_LABEL[status] ?? status}
        <span className="ml-2 text-gray-500">({count})</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">{children}</div>
    </div>
  );
}

export function ProjectWorkspace({
  orgId,
  projectId,
  defaultView = "gantt",
}: {
  orgId: string;
  projectId: string;
  /** 进入项目时默认视图，默认甘特图 */
  defaultView?: View;
}) {
  const [view, setView] = useState<View>(defaultView);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectMembers, setProjectMembers] = useState<ProjectMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsBundle | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [dragging, setDragging] = useState<TaskRow | null>(null);
  const [aiText, setAiText] = useState("");
  /** OpenRouter 解析后的预览（尚未写入数据库） */
  const [aiPreview, setAiPreview] = useState<
    | {
        title: string;
        description: string | null;
        priority: string;
        status: string;
        dueDate: string | null;
      }[]
    | null
  >(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplyLoading, setAiApplyLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** 标题/描述防抖写入，避免未失焦就刷新导致未保存 */
  const titleSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
      setSaveError(null);
    }
    const reqInit: RequestInit = { credentials: "include" };
    async function safeJson(res: Response): Promise<Record<string, unknown>> {
      try {
        return (await res.json()) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    try {
      const [rp, rt, ra, rac] = await Promise.all([
        fetch(`/api/projects/${projectId}`, reqInit),
        fetch(`/api/projects/${projectId}/tasks`, reqInit),
        fetch(`/api/projects/${projectId}/analytics`, reqInit),
        fetch(`/api/projects/${projectId}/activities`, reqInit),
      ]);
      const p = await safeJson(rp);
      const t = await safeJson(rt);
      const a = await safeJson(ra);
      const act = await safeJson(rac);

      if (!rp.ok || !p.project || typeof p.project !== "object") {
        const msg =
          typeof p.error === "string"
            ? p.error
            : rp.status === 401 || rp.status === 403
              ? "无权访问该项目，请重新登录"
              : "无法加载项目";
        if (!silent) {
          setLoadError(msg);
          setProjectName("");
          setProjectMembers([]);
          setTasks([]);
          setAnalytics(null);
          setActivities([]);
        }
        return;
      }

      const proj = p.project as {
        name?: string;
        members?: ProjectMemberOption[];
      };
      setProjectName(proj.name ?? "");
      setProjectMembers(Array.isArray(proj.members) ? proj.members : []);

      setTasks(
        Array.isArray(t.tasks)
          ? (t.tasks as TaskRow[]).map(normalizeTaskRow)
          : [],
      );

      setAnalytics(ra.ok ? parseAnalytics(a) : null);

      setActivities(Array.isArray(act.activities) ? (act.activities as ActivityRow[]) : []);
    } catch {
      if (!silent) {
        setLoadError("加载失败，请检查网络后重试");
        setTasks([]);
        setAnalytics(null);
        setActivities([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { othersPresence } = useProjectRealtime(projectId, {
    onSync: load,
    viewingTaskId: selected?.id ?? null,
    enabled: !loading && !loadError,
  });

  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return null;
      const next = tasks.find((x) => x.id === prev.id);
      /* 任务列表刷新后若找不到同一任务（切换项目或已删除），必须清空，不可用陈旧 prev */
      return next ?? null;
    });
  }, [tasks]);

  useEffect(() => {
    return () => {
      if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
      if (descSaveTimerRef.current) clearTimeout(descSaveTimerRef.current);
    };
  }, [selected?.id]);

  const tasksByStatus = useMemo(() => {
    const m: Record<string, TaskRow[]> = {};
    for (const s of STATUSES) m[s] = [];
    for (const t of tasks) {
      if (!m[t.status]) m[t.status] = [];
      m[t.status].push(t);
    }
    return m;
  }, [tasks]);

  async function patchTask(
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let message = `保存失败（${res.status}）`;
        try {
          const j = (await res.json()) as { error?: unknown };
          if (typeof j.error === "string") {
            message = j.error;
          }
        } catch {
          /* ignore */
        }
        setSaveError(message);
        return false;
      }
      setSaveError(null);
      await load({ silent: true });
      return true;
    } catch {
      setSaveError("网络异常，请稍后重试");
      return false;
    }
  }

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const raw = String(over.id);
    const newStatus = STATUSES.includes(raw as (typeof STATUSES)[number])
      ? raw
      : tasks.find((t) => t.id === raw)?.status;
    if (!newStatus || !STATUSES.includes(newStatus as (typeof STATUSES)[number])) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    void patchTask(taskId, { status: newStatus });
  };

  const chartData = useMemo(() => {
    const byStatus = analytics?.summary?.byStatus;
    if (!byStatus || typeof byStatus !== "object") return [];
    return Object.entries(byStatus).map(([name, value]) => ({
      name: STATUS_LABEL[name] ?? name,
      value,
    }));
  }, [analytics]);

  const ganttMin = useMemo(() => {
    const dates = tasks
      .map((t) => [t.startDate, t.dueDate])
      .flat()
      .filter(Boolean) as string[];
    if (!dates.length) return new Date();
    return new Date(Math.min(...dates.map((d) => new Date(d).getTime())));
  }, [tasks]);

  const barTasks = useMemo(() => {
    return tasks.map((t) => {
      const start = t.startDate ? new Date(t.startDate) : new Date();
      const end = t.dueDate ? new Date(t.dueDate) : new Date(start.getTime() + 86400000 * 3);
      const duration = Math.max(1, (end.getTime() - start.getTime()) / 86400000);
      const offset = (start.getTime() - ganttMin.getTime()) / 86400000;
      return { ...t, offset, duration: Math.max(0.5, duration) };
    });
  }, [tasks, ganttMin]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        加载项目…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-600">{loadError}</p>
        <button
          type="button"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
          onClick={() => void load()}
        >
          重试
        </button>
        <Link href={`/org/${orgId}`} className="text-sm text-gray-600 underline hover:text-red-600">
          返回工作台
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-white text-gray-900">
      {saveError ? (
        <div
          role="alert"
          className="flex items-center justify-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
        >
          <span>{saveError}</span>
          <button
            type="button"
            className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-200"
            onClick={() => setSaveError(null)}
          >
            关闭
          </button>
        </div>
      ) : null}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600">当前项目</p>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">{projectName}</h1>
            <Link
              href={`/org/${orgId}`}
              className="mt-1 inline-flex text-sm text-gray-500 hover:text-red-600"
            >
              ← 返回工作台
            </Link>
          </div>
          <nav className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(
              [
                ["board", "看板", Columns3],
                ["list", "列表", LayoutList],
                ["timeline", "时间轴", Activity],
                ["gantt", "甘特", GanttIcon],
                ["calendar", "日历", CalendarDays],
                ["dashboard", "报表", BarChart3],
                ["activity", "动态", Search],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id as View)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
                  view === id
                    ? "bg-red-600 text-white shadow-sm"
                    : "text-gray-600 hover:bg-white hover:text-gray-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
        {othersPresence.length > 0 ? (
          <div className="mx-auto mt-3 flex max-w-[1600px] flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600">
            <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            <span className="font-medium text-gray-500">其他协作者在线</span>
            {othersPresence.map((v) => (
              <span
                key={v.userId}
                className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-gray-700"
                title={
                  v.taskId
                    ? `正在查看任务（可在列表中对应刷新）`
                    : "在项目页在线"
                }
              >
                {v.name}
                {v.taskId ? " · 查看任务中" : ""}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6">
        {view === "board" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={({ active }) => {
              const t = tasks.find((x) => x.id === active.id);
              if (t) setDragging(t);
            }}
            onDragEnd={onDragEnd}
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {STATUSES.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  count={tasksByStatus[status]?.length ?? 0}
                >
                  {tasksByStatus[status]?.map((task) => (
                    <DraggableTaskCard key={task.id} task={task} onOpen={setSelected} />
                  ))}
                </KanbanColumn>
              ))}
            </div>
            <DragOverlay>
              {dragging ? (
                <div className="rounded-lg border border-red-200 bg-white p-3 shadow-xl ring-2 ring-red-100">
                  <p className="text-sm font-medium text-gray-900">{dragging.title}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {view === "list" && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">任务</th>
                  <th className="px-4 py-3 font-medium text-gray-600">状态</th>
                  <th className="px-4 py-3 font-medium text-gray-600">优先级</th>
                  <th className="px-4 py-3 font-medium text-gray-600">负责人</th>
                  <th className="px-4 py-3 font-medium text-gray-600">截止</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-b border-gray-100 hover:bg-red-50/50"
                    onClick={() => setSelected(t)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{t.title}</td>
                    <td className="px-4 py-3 text-gray-600">{STATUS_LABEL[t.status] ?? t.status}</td>
                    <td className="px-4 py-3 text-gray-600">{t.priority}</td>
                    <td className="px-4 py-3 text-gray-600">{t.assignee?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {t.dueDate ? format(new Date(t.dueDate), "yyyy-MM-dd") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === "timeline" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">按开始日排序的时间轴（与甘特共用任务起止日期）。</p>
            {barTasks
              .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
              .map((t) => (
                <div key={t.id} className="flex items-center gap-4">
                  <div className="w-48 shrink-0 truncate text-sm text-gray-800">{t.title}</div>
                  <div className="relative h-8 flex-1 rounded bg-gray-100">
                    <div
                      className="absolute top-1 h-6 rounded bg-red-500"
                      style={{
                        left: `${Math.min(90, t.offset * 4)}px`,
                        width: `${Math.min(100, t.duration * 24)}px`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        )}

        {view === "gantt" && (
          <GanttChartView
            tasks={tasks}
            onRowClick={(t) => {
              const row = tasks.find((x) => x.id === t.id);
              if (row) setSelected(row);
            }}
          />
        )}

        {view === "calendar" && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">
            <p className="mb-4 text-sm">
              项目日历：按截止日期聚合；生产环境可用 FullCalendar + ics 订阅。
            </p>
            <div className="grid grid-cols-7 gap-2 text-center text-xs text-gray-500">
              {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                <div key={d} className="py-2 font-medium">
                  {d}
                </div>
              ))}
              {Array.from({ length: 28 }).map((_, i) => {
                const dayTasks = tasks.filter(
                  (t) =>
                    t.dueDate &&
                    new Date(t.dueDate).getDate() === (i + 1) &&
                    new Date(t.dueDate).getMonth() === new Date().getMonth(),
                );
                return (
                  <div
                    key={i}
                    className="min-h-[72px] rounded border border-gray-200 bg-gray-50 p-1 text-left"
                  >
                    <span className="text-[10px] text-gray-400">{i + 1}</span>
                    {dayTasks.map((dt) => (
                      <button
                        key={dt.id}
                        type="button"
                        className="mt-0.5 block w-full truncate rounded bg-red-100 px-1 text-[10px] font-medium text-red-800"
                        onClick={() => setSelected(dt)}
                      >
                        {dt.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "dashboard" && analytics?.summary && (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-gray-500">完成率</p>
              <p className="mt-2 text-3xl font-semibold text-red-600">
                {analytics.summary.completionRate}%
              </p>
              <p className="mt-1 text-sm text-gray-500">总任务 {analytics.summary.total}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-gray-500">逾期</p>
              <p className="mt-2 text-3xl font-semibold text-amber-500">
                {analytics.summary.overdueCount}
              </p>
              <p className="mt-1 text-sm text-gray-500">需关注风险任务</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-1">
              <p className="text-xs font-semibold uppercase text-gray-500">工作负载</p>
              <p className="mt-2 text-sm text-gray-600">
                {Object.keys(analytics.workload ?? {}).length} 人分配了任务
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-3">
              <h3 className="mb-4 text-sm font-medium text-gray-800">按状态分布</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="value" fill="#dc2626" name="任务数" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {view === "activity" && (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            {activities.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap gap-2 border-b border-gray-100 pb-3 text-sm last:border-0"
              >
                <span className="text-gray-400">{format(new Date(a.createdAt), "MM-dd HH:mm")}</span>
                <span className="text-gray-800">{a.user?.name ?? "系统"}</span>
                <span className="text-gray-500">{a.action}</span>
                {a.task && <span className="text-red-600 font-medium">{a.task.title}</span>}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* AI 文本分析 — OpenRouter */}
      <section className="mx-auto max-w-[1600px] border-t border-gray-200 bg-gray-50/50 px-4 py-8">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800">
          <Sparkles className="h-4 w-4 text-red-600" />
          AI 文本分析（OpenRouter）
          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-normal text-gray-600">
            看板 / 列表 / 甘特等同源同步
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          粘贴会议纪要、需求片段或待办清单，模型会解析为结构化任务；预览无误后写入本项目，列表与甘特等视图将随数据刷新一并更新。
          需在 .env 配置 OPENROUTER_API_KEY。
        </p>
        {aiNotice ? (
          <p className="mt-2 text-xs text-green-700">{aiNotice}</p>
        ) : null}
        <textarea
          className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
          rows={5}
          placeholder="粘贴待分析文本（至少约 10 个字）…"
          value={aiText}
          disabled={aiLoading || aiApplyLoading}
          onChange={(e) => {
            setAiText(e.target.value);
            setAiNotice(null);
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={aiLoading || aiApplyLoading || aiText.trim().length < 10}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
            onClick={async () => {
              setAiLoading(true);
              setAiNotice(null);
              setSaveError(null);
              try {
                const res = await fetch(`/api/projects/${projectId}/ai/analyze`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: aiText, apply: false }),
                });
                const j = await res.json();
                if (!res.ok) {
                  setSaveError(typeof j.error === "string" ? j.error : "分析失败");
                  setAiPreview(null);
                  return;
                }
                setAiPreview(Array.isArray(j.tasks) ? j.tasks : []);
              } finally {
                setAiLoading(false);
              }
            }}
          >
            {aiLoading ? "分析中…" : "预览解析结果"}
          </button>
          <button
            type="button"
            disabled={
              aiApplyLoading ||
              aiLoading ||
              aiText.trim().length < 10 ||
              !aiPreview?.length
            }
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            onClick={async () => {
              setAiApplyLoading(true);
              setAiNotice(null);
              setSaveError(null);
              try {
                const res = await fetch(`/api/projects/${projectId}/ai/analyze`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text: aiText, apply: true }),
                });
                const j = await res.json();
                if (!res.ok) {
                  setSaveError(typeof j.error === "string" ? j.error : "创建失败");
                  return;
                }
                const n = typeof j.count === "number" ? j.count : j.tasks?.length ?? 0;
                setAiNotice(`已创建 ${n} 条任务并同步到当前项目。`);
                setAiPreview(null);
                await load({ silent: true });
              } finally {
                setAiApplyLoading(false);
              }
            }}
          >
            {aiApplyLoading ? "写入中…" : "确认写入项目"}
          </button>
        </div>
        {aiPreview && aiPreview.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium">标题</th>
                  <th className="px-3 py-2 font-medium">优先级</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">截止</th>
                  <th className="px-3 py-2 font-medium">说明</th>
                </tr>
              </thead>
              <tbody>
                {aiPreview.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{r.title}</td>
                    <td className="px-3 py-2 text-gray-600">{r.priority}</td>
                    <td className="px-3 py-2 text-gray-600">{r.status}</td>
                    <td className="px-3 py-2 text-gray-600 tabular-nums">
                      {r.dueDate ? format(new Date(r.dueDate), "yyyy-MM-dd") : "—"}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-gray-500" title={r.description ?? ""}>
                      {r.description ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* 任务侧栏 */}
      {selected && (
        <div className="fixed bottom-0 right-0 top-0 z-40 w-full max-w-md border-l border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 bg-red-600 px-4 py-3 text-white">
            <h2 className="text-sm font-semibold">任务详情</h2>
            <button
              type="button"
              className="text-red-100 hover:text-white"
              onClick={() => setSelected(null)}
            >
              关闭
            </button>
          </div>
          <div className="space-y-4 overflow-y-auto p-4 pb-24 text-sm text-gray-800">
            <div>
              <label className="text-xs font-medium text-gray-500">任务名称</label>
              <input
                key={`${selected.id}-title`}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                defaultValue={selected.title}
                onChange={(e) => {
                  const v = e.target.value;
                  const taskId = selected.id;
                  if (titleSaveTimerRef.current) clearTimeout(titleSaveTimerRef.current);
                  titleSaveTimerRef.current = setTimeout(() => {
                    titleSaveTimerRef.current = null;
                    void patchTask(taskId, { title: v });
                  }, 850);
                }}
                onBlur={(e) => {
                  if (titleSaveTimerRef.current) {
                    clearTimeout(titleSaveTimerRef.current);
                    titleSaveTimerRef.current = null;
                  }
                  const v = e.target.value;
                  if (v !== selected.title) void patchTask(selected.id, { title: v });
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">任务内容</label>
              <textarea
                key={`${selected.id}-desc`}
                className="mt-1 w-full resize-y rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                rows={5}
                placeholder="描述任务目标、验收标准等"
                defaultValue={selected.description ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const taskId = selected.id;
                  const normalized = v.trim() ? v : null;
                  if (descSaveTimerRef.current) clearTimeout(descSaveTimerRef.current);
                  descSaveTimerRef.current = setTimeout(() => {
                    descSaveTimerRef.current = null;
                    void patchTask(taskId, { description: normalized });
                  }, 850);
                }}
                onBlur={(e) => {
                  if (descSaveTimerRef.current) {
                    clearTimeout(descSaveTimerRef.current);
                    descSaveTimerRef.current = null;
                  }
                  const v = e.target.value;
                  const normalized = v.trim() ? v : null;
                  if (normalized !== (selected.description ?? null)) {
                    void patchTask(selected.id, { description: normalized });
                  }
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">负责人</label>
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={selected.assignee?.id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  void patchTask(selected.id, { assigneeId: v.length > 0 ? v : null });
                }}
              >
                <option value="">未指定</option>
                {projectMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                    {m.user.email ? ` (${m.user.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">协助人</label>
              <p className="mb-2 text-[11px] text-gray-400">
                请选择项目成员；需先将成员加入本项目。
              </p>
              <div className="max-h-36 space-y-1.5 overflow-y-auto rounded border border-gray-200 bg-gray-50/80 px-2 py-2">
                {projectMembers.length === 0 ? (
                  <p className="text-xs text-gray-500">暂无项目成员</p>
                ) : (
                  projectMembers.map((m) => {
                    const aid = new Set(
                      (selected.assistants ?? []).map((a) => a.user.id),
                    );
                    const checked = aid.has(m.user.id);
                    return (
                      <label
                        key={m.user.id}
                        className="flex cursor-pointer items-center gap-2 text-xs text-gray-800"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(aid);
                            if (checked) next.delete(m.user.id);
                            else next.add(m.user.id);
                            void patchTask(selected.id, {
                              assistantIds: Array.from(next),
                            });
                          }}
                        />
                        <span>
                          {m.user.name}
                          <span className="text-gray-500"> · {m.user.email}</span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">当前状态</label>
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={selected.status}
                onChange={(e) => void patchTask(selected.id, { status: e.target.value })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">开始日期</label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={
                  selected.startDate
                    ? format(new Date(selected.startDate), "yyyy-MM-dd")
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  void patchTask(selected.id, {
                    startDate: v
                      ? new Date(`${v}T00:00:00`).toISOString()
                      : null,
                  });
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">截止日期</label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={
                  selected.dueDate ? format(new Date(selected.dueDate), "yyyy-MM-dd") : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  void patchTask(selected.id, {
                    dueDate: v ? new Date(`${v}T00:00:00`).toISOString() : null,
                  });
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">优先级</label>
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={selected.priority}
                onChange={(e) => void patchTask(selected.id, { priority: e.target.value })}
              >
                {Object.values(TaskPriority).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex justify-between text-xs font-medium text-gray-500">
                <span>甘特进度 ({Math.round(selected.progress ?? 0)}%)</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                className="mt-1 w-full accent-red-600"
                value={selected.progress ?? 0}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  void patchTask(selected.id, { progress: n });
                  setSelected((s) => (s ? { ...s, progress: n } : s));
                }}
              />
            </div>
            {selected.dependenciesPredecessors?.length ? (
              <div>
                <p className="text-xs text-gray-500">前置任务</p>
                <ul className="mt-1 list-inside list-disc text-gray-600">
                  {selected.dependenciesPredecessors.map((d) => (
                    <li key={d.predecessor.id}>{d.predecessor.title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
