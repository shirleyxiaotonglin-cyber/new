/** 任务详情/列表：优先展示登录名 username，否则显示 name */
export function userDisplayName(u: { username?: string | null; name: string }): string {
  const uu = typeof u.username === "string" ? u.username.trim() : "";
  return uu.length > 0 ? uu : u.name;
}
