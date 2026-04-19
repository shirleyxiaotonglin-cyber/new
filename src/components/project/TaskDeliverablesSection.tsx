"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { DeliverableCategory } from "@/lib/deliverable-helpers";

type Uploader = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl?: string | null;
};

export type DeliverableItem = {
  id: string;
  taskId: string;
  category: string;
  fileName: string;
  fileType: string;
  size: number;
  version: number;
  createdAt: string;
  uploader: Uploader;
  url: string | null;
};

const CATEGORY_OPTIONS = [
  { value: "", label: "自动识别" },
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

export function TaskDeliverablesSection({
  taskId,
  currentUserId,
}: {
  taskId: string;
  currentUserId: string | null;
}) {
  const [items, setItems] = useState<DeliverableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState<DeliverableItem | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliverables`, { credentials: "include" });
      const j = (await res.json()) as {
        items?: DeliverableItem[];
        storageConfigured?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "加载失败");
      setItems(Array.isArray(j.items) ? j.items : []);
      setStorageConfigured(j.storageConfigured !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (!storageConfigured) {
      setError("文件上传未开通，暂时无法上传。可把说明写在「任务内容」或请管理员开通存储。");
      return;
    }
    setUploading(true);
    setUploadPct(0);
    setError(null);
    try {
      const fd = new FormData();
      list.forEach((f) => fd.append("file", f));
      if (category) fd.append("category", category);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/tasks/${taskId}/deliverables`);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setUploadPct(Math.round((ev.loaded / ev.total) * 100));
      };

      const result = await new Promise<{ ok?: boolean; errors?: string[] }>((resolve, reject) => {
        xhr.onload = () => {
          try {
            resolve(JSON.parse(xhr.responseText || "{}") as { ok?: boolean; errors?: string[] });
          } catch {
            reject(new Error("响应解析失败"));
          }
        };
        xhr.onerror = () => reject(new Error("网络错误"));
        xhr.send(fd);
      });

      if (result.errors?.length) setError(result.errors.join("；"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("确定删除该交付物？")) return;
    setError(null);
    const res = await fetch(`/api/tasks/${taskId}/deliverables/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(typeof j.error === "string" ? j.error : "删除失败");
      return;
    }
    await load();
  }

  const canPreviewImage = (mime: string) => mime.startsWith("image/");
  const canPreviewPdf = (mime: string) => mime === "application/pdf";
  const canPreviewVideo = (mime: string) => mime.startsWith("video/");

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-700">
        <FolderOpen className="h-4 w-4 text-red-600" aria-hidden />
        任务交付物
      </div>
      {!storageConfigured ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-950">
          文件云存储尚未开通：暂无法上传或下载附件，列表中可能仅有记录。如需使用请先联系管理员；也可在「任务内容」里说明线下交付方式。
        </p>
      : null}

      <div
        ref={dropRef}
        role="presentation"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "mt-2 rounded-lg border border-dashed px-3 py-4 text-center text-xs transition-colors",
          dragOver ? "border-red-400 bg-red-50" : "border-gray-300 bg-white/60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          accept="image/*,video/*,application/pdf,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.json,.js,.ts,.tsx,.css,.html"
          disabled={uploading || !storageConfigured}
          onChange={(e) => {
            const f = e.target.files;
            e.target.value = "";
            if (f?.length) void uploadFiles(f);
          }}
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={uploading}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-800"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value || "auto"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={uploading || !storageConfigured}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
          >
            {uploading ?
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            : <Upload className="h-3.5 w-3.5" aria-hidden />}
            {uploading ? `上传中${uploadPct !== null ? ` ${uploadPct}%` : ""}` : "选择文件"}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-gray-500">支持拖拽多个文件到此；单文件最大约 52MB。</p>
      </div>

      {error ?
        <p className="mt-2 text-xs text-red-600">{error}</p>
      : null}

      {loading ?
        <p className="mt-3 text-center text-xs text-gray-500">
          <Loader2 className="mx-auto h-4 w-4 animate-spin text-red-600" />
        </p>
      : items.length === 0 ?
        <p className="mt-3 text-center text-xs text-gray-400">暂无交付物</p>
      : (
        <ul className="mt-3 space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-gray-100 bg-white px-2 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900" title={it.fileName}>
                  <FileText className="mr-1 inline h-3 w-3 shrink-0 text-gray-400" aria-hidden />
                  {it.fileName}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {it.category} · {formatSize(it.size)} · {it.uploader.name}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {it.url && (canPreviewImage(it.fileType) || canPreviewPdf(it.fileType) || canPreviewVideo(it.fileType)) ?
                  <button
                    type="button"
                    className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700 hover:bg-gray-50"
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
                    className="inline-flex items-center rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
                  >
                    <Download className="h-3 w-3" aria-hidden />
                  </a>
                : null}
                <button
                  type="button"
                  className="rounded border border-red-100 px-1.5 py-0.5 text-[10px] text-red-700 hover:bg-red-50 disabled:opacity-40"
                  title={
                    it.uploader.id === currentUserId ? "删除我的文件" : "仅负责人或管理员可删他人文件"
                  }
                  onClick={() => void remove(it.id)}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && preview.url ?
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="关闭预览"
            onClick={() => setPreview(null)}
          />
          <div className="relative z-10 max-h-[90vh] max-w-4xl overflow-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-gray-900">{preview.fileName}</p>
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-900"
                onClick={() => setPreview(null)}
              >
                关闭
              </button>
            </div>
            {canPreviewImage(preview.fileType) ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" className="max-h-[75vh] max-w-full object-contain" />
            : canPreviewPdf(preview.fileType) ?
              <iframe title="pdf" src={preview.url} className="h-[75vh] w-full min-w-[320px] rounded border" />
            : canPreviewVideo(preview.fileType) ?
              <video src={preview.url} controls className="max-h-[75vh] max-w-full" />
            : null}
          </div>
        </div>
      : null}
    </div>
  );
}
