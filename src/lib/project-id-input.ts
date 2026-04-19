/**
 * 「加入项目」输入规范化：去掉空白/零宽字符；若粘贴的是项目页完整 URL，提取 `/project/` 后的 ID。
 */
export function normalizeProjectIdInput(raw: string): string {
  let s = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

  const fromPath = s.match(/\/project\/([^/?#\s]+)/);
  if (fromPath?.[1]) {
    s = fromPath[1];
  }

  s = s.replace(/\s+/g, "");
  return s;
}
