"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, FileText, Loader2, RefreshCw, Search } from "lucide-react";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<HubRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/workspace/deliverables", {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        items?: HubRow[];
        storageConfigured?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setItems([]);
        setStorageConfigured(null);
        setLoadError(typeof j.error === "string" ? j.error : `加载失败（${res.status}）`);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
      setStorageConfigured(j.storageConfigured === true);
    } catch (e) {
      setItems([]);
      setStorageConfigured(null);
      setLoadError(e instanceof Error ? e.message : "加载失败");
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

  useEffect(() => {
    const onSync = () => void load();
    window.addEventListener("ph-deliverables-changed", onSync);
    return () => window.removeEventListener("ph-deliverables-changed", onSync);
  }, [load]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = [
        it.fileName,
        it.taskTitle,
        it.projectName,
        it.orgName,
        it.category,
        it.uploader.name,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  const canPreviewImage = (mime: string) => mime.startsWith("image/");
  const canPreviewPdf = (mime: string) => mime === "application/pdf";
  const canPreviewVideo = (mime: string) => mime.startsWith("video/");

  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">资源中心</h2>
          <p className="mt-1 text-sm text-gray-500">
            汇总你在<strong className="font-medium text-gray-700">已加入项目</strong>
            中各任务上传的交付文件，支持在线预览（图片/PDF/视频）与下载；可从任务详情继续上传或删除。
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件名、项目、任务、类型、上传人…"
            className="min-w-0 flex-1 border-0 bg-transparent text-gray-900 outline-none placeholder:text-gray-400"
          />
        </label>
        {query ?
          <span className="text-xs text-gray-500">
            显示 {filteredItems.length} / {items.length} 条
          </span>
        : null}
      </div>

      {loadError ?
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
          <button
            type="button"
            className="ml-2 font-medium underline"
            onClick={() => void load()}
          >
            重试
          </button>
        </p>
      : null}

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
      : filteredItems.length === 0 ?
        <p className="mt-6 rounded-lg border border-dashed border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
          没有匹配「{query}」的文件，请调整搜索词。
        </p>
      : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">文件</th>
                <th className="px-4 py-3 font-medium text-gray-600">项目</th>
                <th className="px-4 py-3 font-medium text-gray-600">任务</th>
                <th className="px-4 py-3 font-medium text-gray-600">类型</th>
                <th className="px-4 py-3 font-medium text-gray-600">大小</th>
                <th className="px-4 py-3 font-medium text-gray-600">上传人</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">查看</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((it) => {
                const taskOrg = it.projectOrgId || workspaceOrgId;
                const taskHref = `/org/${taskOrg}/project/${it.projectId}?task=${encodeURIComponent(it.taskId)}`;
                const canPv =
                  Boolean(it.url) &&
                  (canPreviewImage(it.fileType) ||
                    canPreviewPdf(it.fileType) ||
                    canPreviewVideo(it.fileType));
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
                      {canPv ?
                        <button
                          type="button"
                          className="mr-2 text-xs font-medium text-red-700 hover:underline"
                          onClick={() => setPreview(it)}
                        >
                          预览
                        </button>
                      : null}
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

      {preview && preview.url ?
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="关闭"
            onClick={() => setPreview(null)}
          />
          <div className="relative z-10 max-h-[90vh] max-w-4xl overflow-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{preview.fileName}</p>
              <div className="flex items-center gap-3">
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-red-700 hover:underline"
                >
                  新窗口打开
                </a>
                <button type="button" className="text-sm text-gray-500" onClick={() => setPreview(null)}>
                  关闭
                </button>
              </div>
            </div>
            {canPreviewImage(preview.fileType) ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" className="max-h-[75vh] max-w-full object-contain" />
            : canPreviewPdf(preview.fileType) ?
              <iframe title="pdf" src={preview.url} className="h-[75vh] w-full rounded border" />
            : canPreviewVideo(preview.fileType) ?
              <video src={preview.url} controls className="max-h-[75vh] max-w-full" />
            : null}
          </div>
        </div>
      : null}
    </section>
  );
}
