"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, FolderPlus, Loader2, LogIn, Rocket, Trash2 } from "lucide-react";
import { ProjectTemplate } from "@/lib/constants";
import { copyTextToClipboard } from "@/lib/copy-text";
import { cn } from "@/lib/cn";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  template: string;
  taskCount: number;
  updatedAt: string;
  orgId: string;
  orgName: string;
  canDelete?: boolean;
};

/** 唯一工作空间下的「我的项目」：含你在各业务侧被加入的项目（跨组织合并展示） */
export function ProjectsHub({
  workspaceOrgId,
  workspaceOrgName,
}: {
  workspaceOrgId: string;
  workspaceOrgName: string;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [name, setName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copiedProjectId, setCopiedProjectId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/workspace/projects", { credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(j.projects)) {
      setProjects(j.projects as ProjectRow[]);
    } else {
      setProjects([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) {
      setErr("请填写项目名称");
      return;
    }
    setCreating(true);
    const res = await fetch(`/api/orgs/${workspaceOrgId}/projects`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), template: ProjectTemplate.CUSTOM }),
    });
    setCreating(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((j as { error?: string }).error?.toString() ?? "创建失败");
      return;
    }
    setName("");
    const id = (j as { project?: { id: string } }).project?.id;
    if (id) router.push(`/org/${workspaceOrgId}/project/${id}`);
    else void load();
  }

  async function joinProject(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!joinId.trim()) {
      setErr("请填写项目 ID");
      return;
    }
    setJoining(true);
    const res = await fetch(`/api/workspace/join-project`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: joinId.trim() }),
    });
    setJoining(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr((j as { error?: string }).error?.toString() ?? "加入失败");
      return;
    }
    const jid = (j as { projectId?: string; orgId?: string }).projectId;
    const jOrg = (j as { orgId?: string }).orgId;
    setJoinId("");
    if (jid && jOrg) router.push(`/org/${jOrg}/project/${jid}`);
    else void load();
  }

  async function copyProjectId(id: string) {
    setErr(null);
    const ok = await copyTextToClipboard(id);
    if (!ok) {
      setErr("无法写入剪贴板，请手动选中下方项目 ID 复制");
      return;
    }
    setCopiedProjectId(id);
    window.setTimeout(() => {
      setCopiedProjectId((cur) => (cur === id ? null : cur));
    }, 2000);
  }

  async function deleteProject(p: ProjectRow) {
    if (
      !confirm(
        `确定删除项目「${p.name}」？项目内所有任务、讨论与交付记录将一并删除，且不可恢复。`,
      )
    ) {
      return;
    }
    setErr(null);
    setDeletingId(p.id);
    try {
      const res = await fetch(`/api/projects/${p.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(typeof j.error === "string" ? j.error : "删除失败");
        return;
      }
      await load();
    } catch {
      setErr("网络异常，删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">项目管理</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">{workspaceOrgName}</h1>
      </header>

      <div className="mx-auto mt-8 max-w-4xl space-y-10">
        <section className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <FolderPlus className="h-5 w-5 text-red-600" />
            新建项目
          </h2>
          <form onSubmit={createProject} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500">项目名称</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Q2 迭代"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-red-600 px-6 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {creating ? "创建中…" : "创建并进入"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <LogIn className="h-5 w-5 text-red-600" />
            加入项目
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            向负责人索取项目 ID，或在本页下方「我的项目」列表中点「复制 ID」。加入后项目会出现在下方列表（无需再单独加入业务组织）。
          </p>
          <form onSubmit={joinProject} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-gray-500">项目 ID</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm text-gray-900"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="粘贴项目 ID"
              />
            </div>
            <button
              type="submit"
              disabled={joining}
              className="rounded-lg border border-red-200 bg-white px-6 py-2.5 font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {joining ? "加入中…" : "加入"}
            </button>
          </form>
        </section>

        {err && <p className="text-sm text-red-600">{err}</p>}

        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Rocket className="h-5 w-5 text-red-600" />
            我的项目
          </h2>
          {loading ? (
            <p className="mt-4 text-gray-500">加载中…</p>
          ) : projects.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">暂无项目，请先新建或加入。</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-red-200 hover:shadow"
                >
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500" title={p.orgName}>
                        {p.orgName}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-gray-400" title={p.id}>
                        {p.id}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-gray-500">{p.taskCount} 任务</span>
                  </div>
                  <div className="flex shrink-0 divide-x divide-gray-200 border-l border-gray-200 bg-red-50/40">
                    <Link
                      href={`/org/${p.orgId}/project/${p.id}`}
                      className="inline-flex min-h-[52px] min-w-[72px] items-center justify-center px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 sm:min-w-[80px]"
                    >
                      进入
                    </Link>
                    {p.canDelete ?
                      <button
                        type="button"
                        disabled={deletingId === p.id}
                        title="删除项目"
                        aria-label={`删除项目：${p.name}`}
                        onClick={() => void deleteProject(p)}
                        className="inline-flex min-h-[52px] min-w-[72px] flex-col items-center justify-center gap-0.5 px-2 py-2 text-[11px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 sm:min-w-[76px]"
                      >
                        {deletingId === p.id ?
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        : <Trash2 className="h-4 w-4 shrink-0" aria-hidden />}
                        删除
                      </button>
                    : null}
                    <button
                      type="button"
                      title="复制项目 ID"
                      aria-label={`复制项目 ID：${p.name}`}
                      onClick={() => void copyProjectId(p.id)}
                      className={cn(
                        "flex min-h-[52px] min-w-[76px] flex-col items-center justify-center gap-0.5 px-2 py-2 text-[11px] font-medium transition-colors sm:min-w-[88px]",
                        copiedProjectId === p.id ?
                          "bg-green-50 text-green-700"
                        : "bg-white/80 text-gray-600 hover:bg-red-50 hover:text-red-700",
                      )}
                    >
                      {copiedProjectId === p.id ?
                        <>
                          <Check className="h-4 w-4 shrink-0" aria-hidden />
                          已复制
                        </>
                      : <>
                          <Copy className="h-4 w-4 shrink-0" aria-hidden />
                          复制 ID
                        </>
                      }
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
