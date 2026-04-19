/**
 * 「加入项目」输入规范化：去掉空白/零宽字符；从 URL 中取 `/project/{id}`，或查询参数 projectId / project / task；
 * 从夹杂中文说明的文本中提取 cuid；统一小写（与库存储一致）。
 */
export function normalizeProjectIdInput(raw: string): string {
  let s = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (!s) return "";

  const fromProjectPath = s.match(/\/project\/([^/?#\s]+)/);
  if (fromProjectPath?.[1]) {
    s = fromProjectPath[1];
  } else {
    try {
      const href = s.includes("://") ? s : `https://_/${s.replace(/^\/+/, "")}`;
      const u = new URL(href);
      const q =
        u.searchParams.get("projectId") ??
        u.searchParams.get("project") ??
        u.searchParams.get("task");
      if (q?.trim()) s = q.trim();
    } catch {
      /* 非 URL，保留原文本继续处理 */
    }
  }

  s = s.replace(/\s+/g, "");

  // 说明文字里夹带的 id（cuid 常以 c 开头）
  if (!/^[a-z0-9]+$/i.test(s) || s.length < 8) {
    const token = s.match(/\b(c[a-z0-9]{10,50})\b/i);
    if (token?.[1]) s = token[1];
  }

  return s.toLowerCase();
}
