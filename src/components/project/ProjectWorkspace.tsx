"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  BarChart3,
  Check,
  Columns3,
  Copy,
  FolderOpen,
  GanttChart as GanttIcon,
  LayoutList,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/cn";
import { copyTextToClipboard } from "@/lib/copy-text";
import { TaskStatus, TaskPriority } from "@/lib/constants";
import { CreateTaskModal } from "@/components/project/CreateTaskModal";
import { GanttChartView } from "@/components/project/GanttChartView";
import { useProjectRealtime } from "@/hooks/useProjectRealtime";
import { TaskChatSection } from "@/components/chat/TaskChatSection";
import { TaskDeliverablesSection } from "@/components/project/TaskDeliverablesSection";
import { ProjectAssetsHub } from "@/components/project/ProjectAssetsHub";
import { formatActivityDescription } from "@/lib/task-update-summary";
import { userDisplayName } from "@/lib/display-user";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  progress?: number | null;
  assignee: { id: string; name: string; username?: string | null } | null;
  tags: { tag: { id: string; name: string; color: string } }[];
  dependenciesPredecessors: {
    predecessor: { id: string; title: string; status: string };
  }[];
  subtasks: { id: string; title: string; status: string }[];
  assistants?: {
    user: { id: string; name: string; username?: string | null; email?: string | null };
  }[];
};

function apiErrorWithHint(j: Record<string, unknown>, fallback: string): string {
  const err = typeof j.error === "string" ? j.error : fallback;
  const hint = typeof j.hint === "string" ? j.hint : "";
  return hint ? `${err}\n\n${hint}` : err;
}

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
  user: { id: string; name: string; email: string; username?: string | null };
};

type View =
  | "board"
  | "list"
  | "gantt"
  | "dashboard"
  | "activity"
  | "ai"
  | "assets";

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
  meta?: string | null;
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const taskFromUrl = searchParams.get("task");

  const [view, setView] = useState<View>(() =>
    searchParams.get("view") === "assets" ? "assets" : defaultView,
  );
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projectName, setProjectName] = useState("");
  const [projectMembers, setProjectMembers] = useState<ProjectMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsBundle | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [assigneeEmailDraft, setAssigneeEmailDraft] = useState("");
  const [assistEmailDraft, setAssistEmailDraft] = useState("");
  /** 重置「添加协助人」下拉，便于连续添加后回到占位项 */
  const [assistMemberSelectKey, setAssistMemberSelectKey] = useState(0);
  /** 侧栏内除标题/正文外的交互（下拉、日期等已多数实时落库；用于点亮「保存修改」） */
  const [taskSidebarDirty, setTaskSidebarDirty] = useState(false);
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
        startDate: string | null;
        /** 甘特进度 0–100，与任务详情滑块一致 */
        progress: number | null;
        assigneeName: string | null;
        assignee: { id: string; name: string } | null;
        assigneeUnresolved?: boolean;
        assistants: { id: string; name: string }[];
      }[]
    | null
  >(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplyLoading, setAiApplyLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const aiPreviewRef = useRef<HTMLDivElement | null>(null);
  /** OpenRouter 后端配置（不含密钥） */
  const [openRouterStatus, setOpenRouterStatus] = useState<{
    configured: boolean;
    model: string;
    refererSource?: string;
    effectiveHttpReferer?: string | null;
    omitAttribution?: boolean;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [savingText, setSavingText] = useState(false);
  /** 项目数据刷新后递增，驱动任务交付物列表重新拉取（与他人上传、动态同步对齐） */
  const [deliverablesNonce, setDeliverablesNonce] = useState(0);
  const [projectIdCopied, setProjectIdCopied] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  /** 任务讨论 SSE 透传 */
  const [taskChatRemote, setTaskChatRemote] = useState<{
    taskId: string;
    message: {
      id: string;
      body: string;
      createdAt: string;
      senderId: string;
      sender: { id: string; name: string; avatarUrl: string | null };
    };
  } | null>(null);

  const goToMessageCenterDm = useCallback(
    (peerUserId: string) => {
      const q = new URLSearchParams({
        peer: peerUserId,
        projectId,
      });
      router.push(`/org/${orgId}/messages?${q.toString()}`);
    },
    [orgId, projectId, router],
  );

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "assets") setView("assets");
    else setView((prev) => (prev === "assets" ? defaultView : prev));
  }, [searchParams, defaultView]);

  const setViewAndUrl = useCallback(
    (next: View) => {
      setView(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "assets") params.set("view", "assets");
      else params.delete("view");
      const qs = params.toString();
      router.replace(`/org/${orgId}/project/${projectId}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [orgId, projectId, router, searchParams],
  );

  const replaceProjectUrl = useCallback(
    (patch: (p: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      patch(params);
      const qs = params.toString();
      router.replace(`/org/${orgId}/project/${projectId}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [orgId, projectId, router, searchParams],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const textDirty = useMemo(() => {
    if (!selected) return false;
    const d = draftDesc.trim();
    const s = (selected.description ?? "").trim();
    const t0 = draftTitle.trim();
    const t1 = (selected.title ?? "").trim();
    return t0 !== t1 || d !== s;
  }, [selected, draftTitle, draftDesc]);

  const detailDirty = useMemo(
    () =>
      textDirty ||
      assigneeEmailDraft.trim().length > 0 ||
      assistEmailDraft.trim().length > 0 ||
      taskSidebarDirty,
    [textDirty, assigneeEmailDraft, assistEmailDraft, taskSidebarDirty],
  );

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
      setDeliverablesNonce((n) => n + 1);
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

  useEffect(() => {
    if (loading || loadError) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/ai/status`, {
          credentials: "include",
        });
        const j = (await res.json()) as {
          configured?: boolean;
          model?: string;
          refererSource?: string;
          effectiveHttpReferer?: string | null;
          omitAttribution?: boolean;
        };
        if (cancelled || !res.ok) return;
        setOpenRouterStatus({
          configured: j.configured === true,
          model: typeof j.model === "string" ? j.model : "openai/gpt-4o-mini",
          refererSource: typeof j.refererSource === "string" ? j.refererSource : undefined,
          effectiveHttpReferer:
            j.effectiveHttpReferer === null || typeof j.effectiveHttpReferer === "string"
              ? j.effectiveHttpReferer
              : undefined,
          omitAttribution: j.omitAttribution === true,
        });
      } catch {
        if (!cancelled) setOpenRouterStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, loading, loadError]);

  const { othersPresence, meId } = useProjectRealtime(projectId, {
    onSync: load,
    viewingTaskId: selected?.id ?? null,
    enabled: !loading && !loadError,
    onTaskChat: (p) => setTaskChatRemote(p),
  });

  useEffect(() => {
    setSelected((prev) => {
      if (!prev) return null;
      const next = tasks.find((x) => x.id === prev.id);
      /* 任务列表刷新后若找不到同一任务（切换项目或已删除），必须清空，不可用陈旧 prev */
      return next ?? null;
    });
  }, [tasks]);

  const selectedId = selected?.id;
  const selectedTitle = selected?.title;
  const selectedDescription = selected?.description;

  /** 仅在切换所选任务时同步草稿。若随 tasks 刷新同步 title/description，会与实时加载打架并清空正在输入的内容（description 在 JSON 中常在 null / 省略之间切换）。 */
  useEffect(() => {
    if (!selectedId) {
      setDraftTitle("");
      setDraftDesc("");
      return;
    }
    setDraftTitle(selectedTitle ?? "");
    setDraftDesc(selectedDescription ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只用 selectedId；勿把 selectedTitle/selectedDescription 列入依赖
  }, [selectedId]);

  useEffect(() => {
    setTaskSidebarDirty(false);
  }, [selectedId]);

  useEffect(() => {
    if (loading || loadError) return;
    const tid = taskFromUrl?.trim();
    if (!tid) return;
    const hit = tasks.find((x) => x.id === tid);
    if (hit) setSelected(hit);
  }, [loading, loadError, tasks, taskFromUrl]);

  useEffect(() => {
    if (aiPreview && aiPreview.length > 0) {
      aiPreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [aiPreview]);

  const tasksByStatus = useMemo(() => {
    const m: Record<string, TaskRow[]> = {};
    for (const s of STATUSES) m[s] = [];
    for (const t of tasks) {
      if (!m[t.status]) m[t.status] = [];
      m[t.status].push(t);
    }
    return m;
  }, [tasks]);

  useEffect(() => {
    setAssigneeEmailDraft("");
    setAssistEmailDraft("");
    setAssistMemberSelectKey((k) => k + 1);
  }, [selected?.id]);

  async function deleteTask(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        let message = `删除失败（${res.status}）`;
        try {
          const j = (await res.json()) as { error?: unknown };
          if (typeof j.error === "string") message = j.error;
        } catch {
          /* ignore */
        }
        setSaveError(message);
        return false;
      }
      setSaveError(null);
      setSelected(null);
      if (searchParams.get("task")) {
        replaceProjectUrl((p) => {
          p.delete("task");
        });
      }
      await load({ silent: true });
      return true;
    } catch {
      setSaveError("网络异常，删除失败");
      return false;
    }
  }

  async function handleCopyProjectId() {
    const ok = await copyTextToClipboard(projectId);
    if (ok) {
      setProjectIdCopied(true);
      window.setTimeout(() => setProjectIdCopied(false), 2000);
      setSaveError(null);
    } else {
      setSaveError("无法复制项目 ID 到剪贴板，请长按下方 ID 手动复制");
    }
  }

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

  async function saveTaskFields() {
    if (!selected) return;
    const title = draftTitle.trim();
    if (!title) {
      setSaveError("任务名称不能为空");
      return;
    }
    if (!detailDirty) {
      setSaveError("任务详情暂无未保存或未应用的改动。");
      return;
    }
    setSavingText(true);
    setSaveError(null);
    try {
      if (textDirty) {
        const ok = await patchTask(selected.id, {
          title,
          description: draftDesc.trim() ? draftDesc : null,
        });
        if (!ok) return;
      }
      if (assigneeEmailDraft.trim()) {
        const ok = await patchTask(selected.id, {
          assigneeEmail: assigneeEmailDraft.trim(),
        });
        if (!ok) return;
        setAssigneeEmailDraft("");
      }
      if (assistEmailDraft.trim()) {
        const currentIds = (selected.assistants ?? []).map((a) => a.user.id);
        const ok = await patchTask(selected.id, {
          assistantIds: currentIds,
          assistantEmails: [assistEmailDraft.trim()],
        });
        if (!ok) return;
        setAssistEmailDraft("");
      }
      setTaskSidebarDirty(false);
    } finally {
      setSavingText(false);
    }
  }

  async function applyAssigneeByEmail() {
    if (!selected) return;
    const v = assigneeEmailDraft.trim();
    if (!v) return;
    const ok = await patchTask(selected.id, { assigneeEmail: v });
    if (ok) setAssigneeEmailDraft("");
  }

  async function addAssistantsByEmail() {
    if (!selected) return;
    const em = assistEmailDraft.trim();
    if (!em) return;
    /** 必须保留仅有 userId、无邮箱的协助人；与 assistantEmails 合并由接口完成 */
    const currentIds = (selected.assistants ?? []).map((a) => a.user.id);
    const ok = await patchTask(selected.id, {
      assistantIds: currentIds,
      assistantEmails: [em],
    });
    if (ok) setAssistEmailDraft("");
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
          <span className="max-w-3xl whitespace-pre-line">{saveError}</span>
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
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600">当前项目</p>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">{projectName}</h1>
            <div className="mt-2 flex max-w-full flex-wrap items-center gap-x-2 gap-y-1">
              <code className="max-w-[min(100%,28rem)] truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 sm:text-xs" title={projectId}>
                {projectId}
              </code>
              <button
                type="button"
                onClick={() => void handleCopyProjectId()}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  projectIdCopied ?
                    "border-green-200 bg-green-50 text-green-800"
                  : "border-gray-200 bg-white text-gray-600 hover:border-red-200 hover:text-red-700",
                )}
                title="复制项目 ID，供同事在「项目管理 → 加入项目」中粘贴"
              >
                {projectIdCopied ?
                  <Check className="h-3.5 w-3.5" aria-hidden />
                : <Copy className="h-3.5 w-3.5" aria-hidden />}
                {projectIdCopied ? "已复制" : "复制 ID"}
              </button>
            </div>
            <Link
              href={`/org/${orgId}`}
              className="mt-2 inline-flex text-sm text-gray-500 hover:text-red-600"
            >
              ← 返回工作台
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateTaskOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
            >
              <Plus className="h-4 w-4" />
              新建任务
            </button>
            <nav className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(
              [
                ["board", "看板", Columns3],
                ["list", "列表", LayoutList],
                ["gantt", "甘特", GanttIcon],
                ["dashboard", "报表", BarChart3],
                ["activity", "动态", Search],
                ["ai", "AI", Sparkles],
                ["assets", "资源中心", FolderOpen],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewAndUrl(id as View)}
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
        {tasks.length === 0 && view !== "assets" ? (
          <div className="mb-4 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
            暂无任务。点击上方「新建任务」手动添加，或切换到「AI」视图从文本批量导入。
          </div>
        ) : null}
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
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600">
                手动维护任务：新建、在侧栏编辑详情，或在本表「操作」列快速打开编辑 / 删除。
              </p>
              <button
                type="button"
                onClick={() => setCreateTaskOpen(true)}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
              >
                <Plus className="h-4 w-4" aria-hidden />
                列表中新建任务
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600">任务</th>
                    <th className="px-4 py-3 font-medium text-gray-600">状态</th>
                    <th className="px-4 py-3 font-medium text-gray-600">优先级</th>
                    <th className="px-4 py-3 font-medium text-gray-600">负责人</th>
                    <th className="px-4 py-3 font-medium text-gray-600">截止</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                        暂无任务。点击「列表中新建任务」或顶部「新建任务」手动添加。
                      </td>
                    </tr>
                  ) : (
                    tasks.map((t) => (
                    <tr
                      key={t.id}
                      className="cursor-pointer border-b border-gray-100 hover:bg-red-50/50"
                      onClick={() => setSelected(t)}
                    >
                      <td className="max-w-[240px] truncate px-4 py-3 font-medium text-gray-900">
                        {t.title}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{STATUS_LABEL[t.status] ?? t.status}</td>
                      <td className="px-4 py-3 text-gray-600">{t.priority}</td>
                      <td
                        className="px-4 py-3 text-gray-600"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {t.assignee ? userDisplayName(t.assignee) : "—"}
                          </span>
                          {t.assignee && meId && t.assignee.id !== meId ? (
                            <button
                              type="button"
                              className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
                              onClick={() => {
                                goToMessageCenterDm(t.assignee!.id);
                              }}
                            >
                              <MessageCircle className="mr-0.5 inline h-3 w-3" aria-hidden />
                              私聊
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {t.dueDate ? format(new Date(t.dueDate), "yyyy-MM-dd") : "—"}
                      </td>
                      <td
                        className="whitespace-nowrap px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            onClick={() => setSelected(t)}
                          >
                            <Pencil className="h-3 w-3" aria-hidden />
                            编辑
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (!confirm(`确定删除任务「${t.title}」？此操作不可撤销。`)) return;
                              void deleteTask(t.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
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
            {activities.length === 0 ?
              <p className="text-sm text-gray-500">暂无动态。</p>
            : activities.map((a) => (
                <div
                  key={a.id}
                  className="border-b border-gray-100 pb-4 text-sm last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-gray-400">{format(new Date(a.createdAt), "MM-dd HH:mm")}</span>
                    <span className="font-medium text-gray-900">{a.user?.name ?? "系统"}</span>
                    <span className="text-gray-600">处理了任务</span>
                    {a.task ?
                      <span className="font-medium text-red-700">「{a.task.title}」</span>
                    : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-gray-700 leading-relaxed">
                    {formatActivityDescription(a.action, a.meta ?? null)}
                  </p>
                </div>
              ))
            }
          </div>
        )}

        {view === "ai" && (
          <section className="rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50/80 to-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800">
                <Sparkles className="h-4 w-4 text-red-600" />
                AI 文本分析（OpenRouter）
                <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-normal text-gray-600">
                  看板 / 列表 / 甘特等同源同步
                </span>
              </div>
              {openRouterStatus ? (
                openRouterStatus.configured ? (
                  <span
                    className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-800"
                    title={
                      openRouterStatus.effectiveHttpReferer != null &&
                      openRouterStatus.effectiveHttpReferer !== ""
                        ? `HTTP-Referer（发往 OpenRouter）: ${openRouterStatus.effectiveHttpReferer}`
                        : openRouterStatus.omitAttribution
                          ? "未发送 HTTP-Referer（OPENROUTER_OMIT_ATTRIBUTION）"
                          : "服务端已配置 OPENROUTER_API_KEY"
                    }
                  >
                    OpenRouter 已就绪 · {openRouterStatus.model}
                  </span>
                ) : (
                  <span
                    className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900"
                    title="请在环境变量中设置 OPENROUTER_API_KEY"
                  >
                    未检测到 API Key
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  检查连接…
                </span>
              )}
            </div>
            {openRouterStatus?.configured && openRouterStatus.refererSource === "default_localhost" ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950">
                当前服务端发往 OpenRouter 的 HTTP-Referer 为默认{" "}
                <code className="rounded bg-amber-100/80 px-0.5">localhost</code>
                。若在 Vercel 等环境仍用此默认值，可能与「在其它网站同一模型可用」不一致；请设置{" "}
                <code className="rounded bg-amber-100/80 px-0.5">NEXT_PUBLIC_APP_URL</code> 或{" "}
                <code className="rounded bg-amber-100/80 px-0.5">OPENROUTER_HTTP_REFERER</code>{" "}
                为你的线上 https 根地址。
              </p>
            ) : null}
            {openRouterStatus?.configured && openRouterStatus.omitAttribution ? (
              <p className="mt-2 text-[11px] text-gray-600">
                已开启 OPENROUTER_OMIT_ATTRIBUTION：请求不附带 HTTP-Referer / X-Title（仅建议用于排查）。
              </p>
            ) : null}
            <p className="mt-2 text-xs text-gray-500">
              粘贴会议纪要、需求片段或待办清单；解析结果与<strong>任务详情侧栏</strong>字段一一对应：任务名称、任务内容、负责人与协助人（支持姓名或邮箱）、当前状态、开始/截止日期、优先级、甘特进度（0–100%）。
              点击「预览解析结果」后在下方表格核对，再「确认写入项目」——写入后会自动打开<strong>第一条</strong>任务详情便于核对。
              需在环境变量中设置 <code className="rounded bg-gray-100 px-0.5">OPENROUTER_API_KEY</code>（本机
              <code className="rounded bg-gray-100 px-0.5">.env</code>，Vercel 在 Settings → Environment
              Variables，改后需 Redeploy）；未配置时接口会返回 503。
            </p>
            {aiNotice ? (
              <p className="mt-2 text-xs text-green-700">{aiNotice}</p>
            ) : null}
            <textarea
              className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              rows={8}
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
                      setSaveError(apiErrorWithHint(j as Record<string, unknown>, "分析失败"));
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
                      setSaveError(apiErrorWithHint(j as Record<string, unknown>, "创建失败"));
                      return;
                    }
                    const n = typeof j.count === "number" ? j.count : j.tasks?.length ?? 0;
                    setAiNotice(`已创建 ${n} 条任务并同步到当前项目。`);
                    setAiPreview(null);
                    await load({ silent: true });
                    const created = j.tasks;
                    if (Array.isArray(created) && created.length > 0) {
                      setSelected(normalizeTaskRow(created[0] as TaskRow));
                    }
                  } finally {
                    setAiApplyLoading(false);
                  }
                }}
              >
                {aiApplyLoading ? "写入中…" : "确认写入项目"}
              </button>
            </div>
            {aiPreview && aiPreview.length > 0 ? (
              <div
                ref={aiPreviewRef}
                className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-xs text-gray-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">任务名称</th>
                      <th className="px-3 py-2 font-medium">负责人</th>
                      <th className="px-3 py-2 font-medium">开始</th>
                      <th className="px-3 py-2 font-medium">截止</th>
                      <th className="px-3 py-2 font-medium">优先级</th>
                      <th className="px-3 py-2 font-medium">状态</th>
                      <th className="px-3 py-2 font-medium">进度</th>
                      <th className="px-3 py-2 font-medium">协作人</th>
                      <th className="px-3 py-2 font-medium">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiPreview.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{r.title}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {r.assignee ?
                            userDisplayName(r.assignee)
                          : r.assigneeUnresolved && r.assigneeName ?
                            <span title="请在项目中添加该成员或改名后重新解析">{r.assigneeName}（未匹配）</span>
                          : r.assigneeName ?
                            r.assigneeName
                          : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-600 tabular-nums">
                          {r.startDate ? format(new Date(r.startDate), "yyyy-MM-dd") : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-600 tabular-nums">
                          {r.dueDate ? format(new Date(r.dueDate), "yyyy-MM-dd") : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{r.priority}</td>
                        <td className="px-3 py-2 text-gray-600">{STATUS_LABEL[r.status] ?? r.status}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-600">
                          {typeof r.progress === "number" ? `${Math.round(r.progress)}%` : "—"}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-3 py-2 text-gray-600"
                          title={(r.assistants ?? []).map((a) => a.name).join("、")}
                        >
                          {(r.assistants ?? []).length ?
                            (r.assistants ?? []).map((a) => a.name).join("、")
                          : "—"}
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
        )}

        {view === "assets" && (
          <div className="border-t border-gray-100 pt-2">
            <p className="mb-4 text-sm text-gray-600">
              汇总本项目所有任务上传的交付物；文件存储在 Supabase Storage（或部署所配置的对象存储），数据库记录任务与文件的绑定关系。
            </p>
            <ProjectAssetsHub orgId={orgId} projectId={projectId} />
          </div>
        )}
      </main>

      {/* 任务侧栏：flex 列 + min-h-0 才能让内部 overflow-y-auto 真正出现滚动条 */}
      {selected && (
        <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-red-600 px-4 py-3 text-white">
            <h2 className="min-w-0 flex-1 text-sm font-semibold">任务详情</h2>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={savingText || !detailDirty}
                title={
                  savingText ?
                    "保存中…"
                  : detailDirty ?
                    "保存标题、正文、待应用的邮箱，并确认本侧栏其它改动"
                  : "当前无待保存项；修改任务详情任意处后可点此"
                }
                onClick={() => void saveTaskFields()}
                className={cn(
                  "rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50",
                  (savingText || !detailDirty) && "cursor-not-allowed opacity-50",
                )}
              >
                {savingText ? "保存中…" : "保存修改"}
              </button>
              <button
                type="button"
                className="shrink-0 text-red-100 hover:text-white"
                onClick={() => {
                  setSelected(null);
                  if (searchParams.get("task")) {
                    replaceProjectUrl((p) => {
                      p.delete("task");
                    });
                  }
                }}
              >
                关闭
              </button>
            </div>
          </div>
          {saveError ?
            <div
              role="alert"
              className="flex shrink-0 items-start justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950"
            >
              <span className="min-w-0 break-words">{saveError}</span>
              <button
                type="button"
                className="shrink-0 font-medium text-amber-900 underline hover:text-amber-950"
                onClick={() => setSaveError(null)}
              >
                关闭
              </button>
            </div>
          : null}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 pb-8 text-sm text-gray-800">
            <div>
              <label className="text-xs font-medium text-gray-500">任务名称</label>
              <input
                key={`${selected.id}-title`}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">任务内容</label>
              <textarea
                key={`${selected.id}-desc`}
                className="mt-1 w-full resize-y rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                rows={5}
                placeholder="描述任务目标、验收标准等"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
              />
            </div>
            {detailDirty ?
              <p className="text-xs text-amber-700">
                任务详情有改动（含标题、正文、下方选项或待应用的邮箱），可点击右上角「保存修改」同步。
              </p>
            : null}

            <TaskDeliverablesSection
              taskId={selected.id}
              currentUserId={meId}
              sectionTitle="文件提交区"
              reloadToken={deliverablesNonce}
            />

            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-gray-500">负责人</label>
                {selected.assignee && meId && selected.assignee.id !== meId ? (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
                    onClick={() => goToMessageCenterDm(selected.assignee!.id)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                    私聊
                  </button>
                ) : null}
              </div>
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={selected.assignee?.id ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setTaskSidebarDirty(true);
                  void patchTask(selected.id, { assigneeId: v.length > 0 ? v : null });
                }}
              >
                <option value="">未指定</option>
                {projectMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {userDisplayName(m.user)}
                    {m.user.email ? ` (${m.user.email})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] leading-snug text-gray-400">
                下拉列表为已在项目中的成员；也可输入<strong>对方注册邮箱</strong>
                ，保存后将其加入本项目并设为负责人（须账号已存在）。
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="负责人邮箱（例 user@company.com）"
                  className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
                  value={assigneeEmailDraft}
                  onChange={(e) => setAssigneeEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void applyAssigneeByEmail();
                    }
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                  onClick={() => void applyAssigneeByEmail()}
                >
                  应用
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">协助人</label>
              <p className="mb-2 text-[11px] text-gray-400">
                用下方下拉或勾选成员添加；亦可填写<strong>对方注册邮箱</strong>添加（须已注册，将自动加入本项目）。
                负责人不会出现在协助人列表中。
              </p>
              <select
                key={`${selected.id}-assist-add-${assistMemberSelectKey}`}
                className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                defaultValue=""
                onChange={(e) => {
                  const uid = e.target.value;
                  if (!uid || !selected) return;
                  const aid = new Set((selected.assistants ?? []).map((a) => a.user.id));
                  if (aid.has(uid)) {
                    setAssistMemberSelectKey((k) => k + 1);
                    return;
                  }
                  aid.add(uid);
                  setTaskSidebarDirty(true);
                  void patchTask(selected.id, { assistantIds: Array.from(aid) }).then(() => {
                    setAssistMemberSelectKey((k) => k + 1);
                  });
                }}
              >
                <option value="">添加协助人（从项目成员中选择）…</option>
                {projectMembers
                  .filter((m) => {
                    if (selected.assignee?.id === m.user.id) return false;
                    const cur = new Set((selected.assistants ?? []).map((a) => a.user.id));
                    return !cur.has(m.user.id);
                  })
                  .map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {userDisplayName(m.user)}
                      {m.user.email ? ` (${m.user.email})` : ""}
                    </option>
                  ))}
              </select>
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
                      <div
                        key={m.user.id}
                        className="flex items-center justify-between gap-2 rounded px-0.5 py-0.5 hover:bg-white/80"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-gray-800">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(aid);
                              if (checked) next.delete(m.user.id);
                              else next.add(m.user.id);
                              setTaskSidebarDirty(true);
                              void patchTask(selected.id, {
                                assistantIds: Array.from(next),
                              });
                            }}
                          />
                          <span className="truncate">
                            {userDisplayName(m.user)}
                            <span className="text-gray-500"> · {m.user.email}</span>
                          </span>
                        </label>
                        {meId && m.user.id !== meId ? (
                          <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
                            onClick={() => goToMessageCenterDm(m.user.id)}
                          >
                            私聊
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="协作人邮箱（须已注册）"
                  className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
                  value={assistEmailDraft}
                  onChange={(e) => setAssistEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addAssistantsByEmail();
                    }
                  }}
                />
                <button
                  type="button"
                  className="shrink-0 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50"
                  onClick={() => void addAssistantsByEmail()}
                >
                  添加
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">当前状态</label>
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900"
                value={selected.status}
                onChange={(e) => {
                  setTaskSidebarDirty(true);
                  void patchTask(selected.id, { status: e.target.value });
                }}
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
                  setTaskSidebarDirty(true);
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
                  setTaskSidebarDirty(true);
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
                onChange={(e) => {
                  setTaskSidebarDirty(true);
                  void patchTask(selected.id, { priority: e.target.value });
                }}
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
                  setTaskSidebarDirty(true);
                  void patchTask(selected.id, { progress: n });
                  setSelected((s) => (s ? { ...s, progress: n } : s));
                }}
              />
            </div>

            <TaskChatSection
              taskId={selected.id}
              currentUserId={meId}
              remotePayload={taskChatRemote}
              onRemoteConsumed={() => setTaskChatRemote(null)}
            />

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
            <div className="border-t border-gray-200 pt-4">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800 hover:bg-red-100"
                onClick={() => {
                  if (!confirm("确定删除该任务？此操作不可撤销。")) return;
                  void deleteTask(selected.id);
                }}
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                删除任务
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateTaskModal
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        projectId={projectId}
        members={projectMembers}
        onCreated={(raw) => {
          const row = normalizeTaskRow(raw as TaskRow);
          setSelected(row);
          void load({ silent: true });
        }}
        onRequestError={(msg) => setSaveError(msg)}
      />

    </div>
  );
}
