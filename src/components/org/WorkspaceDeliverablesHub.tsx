"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";

type HubRow = {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  projectOrgId: string;
  orgName: string;
  category: string;
  fileName: string;
  fileType: string;
  size: number;
  createdAt: string;
  uploader: { id: string; name: string; email: string | null };
  url: string | null;
};

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** 项目管理页「资源中心」：汇总当前用户已加入各项目内的交付文件 */
export function WorkspaceDeliverablesHub({
  workspaceOrgId,
}: {
  workspaceOrgId: string;
}) {
  const [items, setItems] = useState<HubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workspace/deliverables", { credentials: "include" });
      const j = (await res.json()) as {
        items?: HubRow[];
        storageConfigured?: boolean;
      };
      if (!res.ok) throw new Error("加载失败");
      setItems(Array.isArray(j.items) ? j.items : []);
      setStorageConfigured(j.storageConfigured === true);
    } catch {
      setItems([]);
      setStorageConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">资源中心</h2>
          <p className="mt-1 text-sm text-gray-500">
            汇总你在<strong className="font-medium text-gray-700">已加入项目</strong>
            中各任务上传的文件，支持下载；进入项目后可按任务继续管理。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          刷新
        </button>
      </div>

      {storageConfigured === false ?
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          云端存储尚未配置：列表可能仅有记录，下载链接不可用。请在服务端配置 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 与存储桶。
        </p>
      : null}

      {loading ?
        <div className="flex justify-center py-12 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      : items.length === 0 ?
        <p className="mt-6 rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          暂无上传文件。在<strong>项目工作台</strong>打开任务详情，在「文件提交区」上传后，会出现在此列表。
        </p>
      : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">文件</th>
                <th className="px-4 py-3 font-medium text-gray-600">项目</th>
                <th className="px-4 py-3 font-medium text-gray-600">任务</th>
                <th className="px-4 py-3 font-medium text-gray-600">类型</th>
                <th className="px-4 py-3 font-medium text-gray-600">大小</th>
                <th className="px-4 py-3 font-medium text-gray-600">上传人</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const taskOrg = it.projectOrgId || workspaceOrgId;
                const taskHref = `/org/${taskOrg}/project/${it.projectId}?task=${encodeURIComponent(it.taskId)}`;
                return (
                  <tr key={it.id} className="border-b border-gray-100 hover:bg-red-50/30">
                    <td className="max-w-[200px] px-4 py-3">
                      <span className="flex items-center gap-1 truncate font-medium text-gray-900">
                        <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                        {it.fileName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-700">{it.projectName}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-400">{it.orgName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={taskHref} className="font-medium text-red-700 hover:underline">
                        {it.taskTitle}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{it.category}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatSize(it.size)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{it.uploader.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {it.url ?
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline"
                        >
                          <Download className="h-4 w-4" aria-hidden />
                          下载
                        </a>
                      :
                        <span className="text-xs text-gray-400">无链接</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
