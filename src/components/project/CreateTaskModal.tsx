"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { TaskPriority, TaskStatus } from "@/lib/constants";
import { cn } from "@/lib/cn";

const STATUS_LABEL: Record<string, string> = {
  [TaskStatus.TODO]: "待办",
  [TaskStatus.DOING]: "进行中",
  [TaskStatus.DONE]: "已完成",
  [TaskStatus.BLOCKED]: "阻塞",
};

interface MemberOption {
  userId: string;
  user: { id: string; name: string; email: string };
}

function emptyForm() {
  return {
    title: "",
    description: "",
    status: TaskStatus.TODO as string,
    priority: TaskPriority.P2 as string,
    assigneeId: "",
    startDate: "",
    dueDate: "",
    progress: 0,
    assistantIds: [] as string[],
  };
}

export function CreateTaskModal({
  open,
  onClose,
  projectId,
  members,
  onCreated,
  onRequestError,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  members: MemberOption[];
  onCreated: (task: Record<string, unknown>) => void;
  onRequestError: (message: string) => void;
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(emptyForm());
  }, [open]);

  if (!open) return null;

  function toggleAssistant(userId: string) {
    setForm((f) => {
      const has = f.assistantIds.includes(userId);
      return {
        ...f,
        assistantIds: has
          ? f.assistantIds.filter((id) => id !== userId)
          : [...f.assistantIds, userId],
      };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) {
      onRequestError("请填写任务名称");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title,
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        assigneeId: form.assigneeId || null,
        startDate: form.startDate
          ? new Date(`${form.startDate}T00:00:00`).toISOString()
          : null,
        dueDate: form.dueDate ? new Date(`${form.dueDate}T00:00:00`).toISOString() : null,
        progress: form.progress,
      };
      if (form.assistantIds.length > 0) {
        body.assistantIds = form.assistantIds;
      }
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { task?: Record<string, unknown>; error?: string };
      if (!res.ok) {
        onRequestError(typeof j.error === "string" ? j.error : "创建失败");
        return;
      }
      if (j.task) {
        onCreated(j.task);
        onClose();
      }
    } catch {
      onRequestError("网络异常");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭"
        onClick={() => !saving && onClose()}
      />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">新建任务</h2>
          <button
            type="button"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={() => !saving && onClose()}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={(e) => void submit(e)} className="max-h-[85vh] space-y-3 overflow-y-auto p-4 text-sm">
          <div>
            <label className="text-xs font-medium text-gray-500">任务名称 *</label>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="简要标题"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">任务内容</label>
            <textarea
              className="mt-1 w-full resize-y rounded border border-gray-300 px-2 py-1.5 text-gray-900"
              rows={4}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="目标、验收标准等"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">状态</label>
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              >
                {Object.values(TaskStatus).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s] ?? s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">优先级</label>
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {Object.values(TaskPriority).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">负责人</label>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={form.assigneeId}
              onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
            >
              <option value="">未指定</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                  {m.user.email ? ` (${m.user.email})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">开始日期</label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">截止日期</label>
              <input
                type="date"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="flex justify-between text-xs font-medium text-gray-500">
              <span>进度 ({form.progress}%)</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              className="mt-1 w-full accent-red-600"
              value={form.progress}
              onChange={(e) =>
                setForm((f) => ({ ...f, progress: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">协助人</label>
            <div className="mt-1 max-h-28 space-y-1 overflow-y-auto rounded border border-gray-200 bg-gray-50 px-2 py-2">
              {members.length === 0 ?
                <p className="text-xs text-gray-500">暂无项目成员</p>
              : members.map((m) => (
                  <label
                    key={m.user.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 text-xs",
                      form.assigneeId === m.user.id ? "text-gray-400" : "text-gray-800",
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={form.assigneeId === m.user.id}
                      checked={form.assistantIds.includes(m.user.id)}
                      onChange={() => toggleAssistant(m.user.id)}
                      className="rounded border-gray-300 text-red-600"
                    />
                    <span>{m.user.name}</span>
                  </label>
                ))
              }
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              onClick={() => !saving && onClose()}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "创建中…" : "创建任务"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
