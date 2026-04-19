"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
  X,
  AlertCircle,
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
  sectionTitle = "任务交付物",
  /** 父组件在项目同步加载成功后递增，用于刷新本地上传列表（避免与他人上传不同步） */
  reloadToken,
}: {
  taskId: string;
  currentUserId: string | null;
  /** 侧栏中展示为「文件提交区」等 */
  sectionTitle?: string;
  reloadToken?: number;
}) {
  const [items, setItems] = useState<DeliverableItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** true = 接口确认已配置存储；false = 未开通；null = 加载失败或尚未确认，仍可尝试上传（503 会明确设为 false） */
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  /** 仅列表 GET / 删除接口错误；勿与上传反馈混用，否则 await load() 刷新列表时会误清上传提示 */
  const [listError, setListError] = useState<string | null>(null);
  /** 上传结果（成功/失败）；独立于 listError，避免 load() 把它清掉 */
  const [uploadToast, setUploadToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [category, setCategory] = useState("");
  const [preview, setPreview] = useState<DeliverableItem | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState(52 * 1024 * 1024);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputId = `task-deliverables-file-${taskId}`;
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/deliverables`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json()) as {
        items?: DeliverableItem[];
        storageConfigured?: boolean;
        error?: string;
        maxUploadBytes?: number;
      };
      if (!res.ok) {
        setItems([]);
        setStorageConfigured(null);
        setListError(typeof j.error === "string" ? j.error : `加载失败（${res.status}）`);
        return;
      }
      setListError(null);
      setItems(Array.isArray(j.items) ? j.items : []);
      /** 仅以接口返回值为准；网络错误时不要假定「未开通存储」，否则会永久禁用上传 */
      setStorageConfigured(j.storageConfigured === true);
      if (typeof j.maxUploadBytes === "number" && j.maxUploadBytes > 0) {
        setMaxUploadBytes(j.maxUploadBytes);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "加载失败");
      setItems([]);
      setStorageConfigured(null);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  /** 成功提示较短自动消失；失败提示保留更久便于复制配置说明 */
  useEffect(() => {
    if (!uploadToast) return;
    const ms = uploadToast.type === "success" ? 5200 : 14000;
    const t = window.setTimeout(() => setUploadToast(null), ms);
    return () => window.clearTimeout(t);
  }, [uploadToast]);

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    if (storageConfigured === false) {
      const msg =
        "提交失败：云存储未开通。请在服务端配置 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY，并在 Supabase 创建与 SUPABASE_STORAGE_BUCKET 一致的私有存储桶。";
      setUploadToast({ type: "error", message: msg });
      return;
    }
    for (const f of list) {
      if (f.size > maxUploadBytes) {
        setUploadToast({
          type: "error",
          message: `提交失败：「${f.name}」超过单文件上限（约 ${Math.floor(maxUploadBytes / 1024 / 1024)}MB），请压缩后重试。`,
        });
        return;
      }
    }
    setUploading(true);
    setUploadPct(0);
    setUploadToast(null);
    const errs: string[] = [];
    const successes: string[] = [];

    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const basePct = (i / list.length) * 100;

        const signRes = await fetch(`/api/tasks/${taskId}/deliverables/sign-upload`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
            category: category || undefined,
          }),
        });
        let signJ: {
          signedUrl?: string;
          path?: string;
          meta?: { category: string; fileName: string; mimeType: string; size: number };
          error?: string;
          hint?: string;
        };
        try {
          signJ = (await signRes.json()) as typeof signJ;
        } catch {
          errs.push(`${file.name}：服务器返回异常（非 JSON），请检查是否已登录或网络中断`);
          continue;
        }

        if (!signRes.ok) {
          if (signRes.status === 503) {
            setStorageConfigured(false);
            const hint = typeof signJ.hint === "string" ? ` ${signJ.hint}` : "";
            errs.push(
              `${file.name}：${typeof signJ.error === "string" ? signJ.error : "存储未开通"}${hint}`,
            );
          } else if (signRes.status === 401) {
            errs.push(`${file.name}：请先登录`);
          } else if (signRes.status === 403) {
            errs.push(`${file.name}：${typeof signJ.error === "string" ? signJ.error : "无权上传"}`);
          } else {
            errs.push(`${file.name}：${typeof signJ.error === "string" ? signJ.error : `签发失败（${signRes.status}）`}`);
          }
          continue;
        }

        const putUrl = signJ.signedUrl;
        if (!putUrl || !signJ.path || !signJ.meta) {
          errs.push(`${file.name}：签发响应无效`);
          continue;
        }

        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", putUrl);
            xhr.upload.onprogress = (ev) => {
              if (ev.lengthComputable) {
                const slice = 100 / list.length;
                const p = basePct + (ev.loaded / ev.total) * slice;
                setUploadPct(Math.min(99, Math.round(p)));
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else
                reject(
                  new Error(
                    `直传失败（HTTP ${xhr.status}）：请确认 Supabase 已创建与 SUPABASE_STORAGE_BUCKET 一致的存储桶且可写入。`,
                  ),
                );
            };
            xhr.onerror = () => reject(new Error("直传网络错误"));
            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
            xhr.send(file);
          });
        } catch (e) {
          errs.push(`${file.name}：${e instanceof Error ? e.message : "直传失败"}`);
          continue;
        }

        const doneRes = await fetch(`/api/tasks/${taskId}/deliverables/complete-upload`, {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: signJ.path,
            category: signJ.meta.category,
            fileName: signJ.meta.fileName,
            mimeType: signJ.meta.mimeType,
            size: signJ.meta.size,
          }),
        });
        const doneJ = (await doneRes.json()) as { error?: string };
        if (!doneRes.ok) {
          errs.push(`${file.name}：${typeof doneJ.error === "string" ? doneJ.error : "保存记录失败"}`);
        } else {
          successes.push(file.name);
        }
      }

      if (errs.length === 0 && successes.length > 0) {
        const msg =
          successes.length === 1 ?
            `提交成功：「${successes[0]}」已上传`
          : `提交成功：已上传 ${successes.length} 个文件（${successes.slice(0, 4).join("、")}${successes.length > 4 ? "…" : ""}）`;
        setUploadToast({ type: "success", message: msg });
      } else if (errs.length > 0 && successes.length > 0) {
        setUploadToast({
          type: "error",
          message: `部分提交失败（${successes.length} 个已成功）：${errs.join("；")}`,
        });
      } else if (errs.length > 0) {
        setUploadToast({ type: "error", message: `提交失败：${errs.join("；")}` });
      }

      await load();
      window.dispatchEvent(new CustomEvent("ph-deliverables-changed"));
    } catch (e) {
      setUploadToast({
        type: "error",
        message: `提交失败：${e instanceof Error ? e.message : "未知错误"}`,
      });
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("确定删除该交付物？")) return;
    setListError(null);
    const res = await fetch(`/api/tasks/${taskId}/deliverables/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setUploadToast({
        type: "error",
        message: typeof j.error === "string" ? `删除失败：${j.error}` : "删除失败",
      });
      return;
    }
    setUploadToast({ type: "success", message: "已删除该交付物" });
    await load();
    window.dispatchEvent(new CustomEvent("ph-deliverables-changed"));
  }

  const canPreviewImage = (mime: string) => mime.startsWith("image/");
  const canPreviewPdf = (mime: string) => mime === "application/pdf";
  const canPreviewVideo = (mime: string) => mime.startsWith("video/");

  return (
    <div className="relative rounded-xl border border-gray-200 bg-gray-50/80 p-3">
      {uploadToast ?
        <div
          role={uploadToast.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "mb-3 flex gap-2 rounded-lg border px-3 py-2.5 text-xs shadow-sm",
            uploadToast.type === "success" ?
              "border-green-200 bg-green-50 text-green-900"
            : "border-red-200 bg-red-50 text-red-950",
          )}
        >
          {uploadToast.type === "success" ?
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
          : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />}
          <p className="min-w-0 flex-1 whitespace-pre-wrap leading-snug">{uploadToast.message}</p>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-black/5 hover:text-gray-800"
            aria-label="关闭提示"
            onClick={() => setUploadToast(null)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      : null}

      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-700">
        <FolderOpen className="h-4 w-4 text-red-600" aria-hidden />
        {sectionTitle}
      </div>
      {storageConfigured === false ?
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-950">
          文件云存储尚未开通：配置 Supabase Storage（SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、存储桶）后即可上传并在资源中心汇总。在此之前可在「任务内容」说明线下交付方式。
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
          id={fileInputId}
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          accept="image/*,video/*,application/pdf,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.json,.js,.ts,.tsx,.css,.html"
          disabled={uploading}
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
          {uploading ?
            <span
              className="inline-flex cursor-wait items-center gap-1 rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white opacity-90"
              aria-busy
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              上传中{uploadPct !== null ? ` ${uploadPct}%` : ""}
            </span>
          : (
            <label
              htmlFor={fileInputId}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700",
                storageConfigured === false && "ring-2 ring-amber-300 ring-offset-1",
              )}
              title={
                storageConfigured === false ?
                  "云存储未配置：可选文件，提交时会提示如何配置 Supabase"
                : undefined
              }
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              选择文件
            </label>
          )}
        </div>
        <p className="mt-2 text-[10px] text-gray-500">
          支持拖拽多个文件。单文件最大约 {Math.floor(maxUploadBytes / 1024 / 1024)}MB，经浏览器直传至对象存储，不经过应用服务器，可突破 Vercel 等对 API 体积极限。存储未配置时上传将提示失败。
        </p>
        {storageConfigured === null && !loading ?
          <button
            type="button"
            className="mt-2 text-[10px] font-medium text-red-700 underline hover:text-red-800"
            onClick={() => void load()}
          >
            列表加载异常？点击重新检测存储与文件列表
          </button>
        : null}
      </div>

      {listError ?
        <p className="mt-2 text-xs text-red-600" role="alert">
          {listError}
        </p>
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
