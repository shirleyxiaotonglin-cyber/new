/** 从响应体解析可读错误（兼容 JSON 与非 JSON 的 500 页面）；只读取 body 一次 */
export async function parseApiError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const j = JSON.parse(raw) as { error?: string };
    if (typeof j.error === "string" && j.error.length > 0) return j.error;
  } catch {
    /* 非 JSON */
  }
  const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 180);
  if (snippet && !snippet.startsWith("<!")) return snippet;
  return `请求失败（HTTP ${res.status}）`;
}
