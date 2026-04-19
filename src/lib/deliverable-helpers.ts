/** 任务交付物：MIME 推断分类、大小与类型校验 */

export const MAX_DELIVERABLE_BYTES = 52 * 1024 * 1024;

export const DeliverableCategory = {
  DOCUMENT: "DOCUMENT",
  IMAGE: "IMAGE",
  DESIGN: "DESIGN",
  CODE: "CODE",
  ARCHIVE: "ARCHIVE",
  VIDEO: "VIDEO",
  OTHER: "OTHER",
} as const;

const CATEGORY_SET: Set<string> = new Set(Object.values(DeliverableCategory));

export function normalizeDeliverableCategory(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return DeliverableCategory.OTHER;
  const u = raw.trim().toUpperCase();
  return CATEGORY_SET.has(u) ? u : DeliverableCategory.OTHER;
}

export function inferCategoryFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return DeliverableCategory.IMAGE;
  if (m.startsWith("video/")) return DeliverableCategory.VIDEO;
  if (m === "application/pdf") return DeliverableCategory.DOCUMENT;
  if (
    m.includes("zip") ||
    m.includes("rar") ||
    m.includes("7z") ||
    m === "application/x-tar" ||
    m === "application/gzip" ||
    m === "application/x-7z-compressed"
  ) {
    return DeliverableCategory.ARCHIVE;
  }
  if (
    m.startsWith("text/") ||
    m === "application/json" ||
    m.includes("javascript") ||
    m.includes("typescript") ||
    m.includes("xml") ||
    m === "application/x-httpd-php"
  ) {
    return DeliverableCategory.CODE;
  }
  if (
    m.includes("photoshop") ||
    m.includes("illustrator") ||
    m === "application/postscript" ||
    m.includes("ms-excel") ||
    m.includes("wordprocessingml") ||
    m.includes("spreadsheetml") ||
    m.includes("presentationml")
  ) {
    return DeliverableCategory.DOCUMENT;
  }
  return DeliverableCategory.OTHER;
}

export function isBlockedMime(mime: string): boolean {
  const m = mime.toLowerCase();
  if (m.includes("application/x-msdownload") || m.includes("x-msdos-program")) return true;
  if (m === "application/x-executable" || m === "application/x-sh") return true;
  return false;
}

export function safeStorageFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, "_");
  return base.length > 180 ? base.slice(0, 180) : base;
}
