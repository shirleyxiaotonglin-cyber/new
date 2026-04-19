"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Download,
  FileText,
  Filter,
  Loader2,
  Search,
} from "lucide-react";
import { DeliverableCategory } from "@/lib/deliverable-helpers";
import type { DeliverableItem } from "@/components/project/TaskDeliverablesSection";

type HubRow = DeliverableItem & { taskTitle: string };

const CATEGORIES = [
  { value: "", label: "全部类型" },
  { value: DeliverableCategory.DOCUMENT, label: "文档" },
  { value: DeliverableCategory.IMAGE, label: "图片" },
  { value: DeliverableCategory.DESIGN, label: "设计稿" },
  { value: DeliverableCategory.CODE, label: "代码/文本" },
  { value: DeliverableCategory.ARCHIVE, label: "压缩包" },
  { value: DeliverableCategory.VIDEO, label: "视频" },
  { value: DeliverableCategory.OTHER, label: "其它" },
];

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ProjectAssetsHub({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) {
  const [items, setItems] = useState<HubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [taskFilter, setTaskFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [uploaderFilter, setUploaderFilter] = useState("");
  const [preview, setPreview] = useState<HubRow | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [taskList, setTaskList] = useState<{ id: string; title: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (taskFilter) q.set("taskId", taskFilter);
      if (categoryFilter) q.set("category", categoryFilter);
      if (uploaderFilter) q.set("uploaderId", uploaderFilter);
      const res = await fetch(
        `/api/projects/${projectId}/deliverables?${q.toString()}`,
        { credentials: "include" },
      );
      const j = (await res.json()) as {
        items?: (DeliverableItem & { taskTitle: string })[];
        storageConfigured?: boolean;
      };
      if (!res.ok) throw new Error("加载失败");
      setItems(Array.isArray(j.items) ? (j.items as HubRow[]) : []);
      setStorageConfigured(j.storageConfigured !== false);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, taskFilter, categoryFilter, uploaderFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const [pr, tt] = await Promise.all([
        fetch(`/api/projects/${projectId}`, { credentials: "include" }),
        fetch(`/api/projects/${projectId}/tasks`, { credentials: "include" }),
      ]);
      const pj = (await pr.json()) as {
        project?: { members?: { user: { id: string; name: string; email: string } }[] };
      };
      const m = pj.project?.members;
      setMembers(m?.map((x) => x.user) ?? []);

      const tj = (await tt.json()) as { tasks?: { id: string; title: string }[] };
      setTaskList(Array.isArray(tj.tasks) ? tj.tasks.map((t) => ({ id: t.id, title: t.title })) : []);
    })();
  }, [projectId]);

  const canPreviewImage = (mime: string) => mime.startsWith("image/");
  const canPreviewPdf = (mime: string) => mime === "application/pdf";
  const canPreviewVideo = (mime: string) => mime.startsWith("video/");

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Filter className="h-4 w-4 text-red-600" aria-hidden />
          筛选
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500">任务</label>
          <select
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
            className="mt-0.5 min-w-[160px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">全部任务</option>
            {taskList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500">类型</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="mt-0.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value || "all"} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500">上传人</label>
          <select
            value={uploaderFilter}
            onChange={(e) => setUploaderFilter(e.target.value)}
            className="mt-0.5 min-w-[140px] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">全部</option>
            {members.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <Search className="h-4 w-4" aria-hidden />
          刷新
        </button>
      </div>

      {!storageConfigured ?
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          文件存储未完全开通时，预览与下载链接可能不可用。可先联系管理员；重要文件建议在任务交付物上传成功后再归档。
        </p>
      : null}

      {loading ?
        <div className="flex justify-center py-16 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
        </div>
      : items.length === 0 ?
        <p className="py-16 text-center text-gray-500">暂无交付物，请在任务详情中上传。</p>
      : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-600">文件</th>
                <th className="px-4 py-3 font-medium text-gray-600">任务</th>
                <th className="px-4 py-3 font-medium text-gray-600">类型</th>
                <th className="px-4 py-3 font-medium text-gray-600">大小</th>
                <th className="px-4 py-3 font-medium text-gray-600">上传人</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-gray-100 hover:bg-red-50/30">
                  <td className="max-w-[240px] px-4 py-3">
                    <span className="flex items-center gap-1 truncate font-medium text-gray-900">
                      <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                      {it.fileName}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link
                      href={`/org/${orgId}/project/${projectId}`}
                      className="text-red-700 hover:underline"
                    >
                      {it.taskTitle}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{it.category}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatSize(it.size)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{it.uploader.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {it.url && (canPreviewImage(it.fileType) || canPreviewPdf(it.fileType) || canPreviewVideo(it.fileType)) ?
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
                        className="inline-flex items-center text-red-700 hover:underline"
                      >
                        <Download className="h-4 w-4" aria-hidden />
                      </a>
                    :
                      <span className="text-xs text-gray-400">无链接</span>
                    }
                  </td>
                </tr>
              ))}
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
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{preview.fileName}</p>
              <button type="button" className="text-sm text-gray-500" onClick={() => setPreview(null)}>
                关闭
              </button>
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
    </div>
  );
}
