/** 任务详情/列表：优先展示登录名 username，否则显示 name */
export function userDisplayName(u: { username?: string | null; name: string }): string {
  const uu = typeof u.username === "string" ? u.username.trim() : "";
  return uu.length > 0 ? uu : u.name;
}

/** 私信会话列表与顶栏：登录名 → 姓名 → 邮箱 @ 前 → id 前缀 */
export function directMessagePeerLabel(peer: {
  id: string;
  username?: string | null;
  name: string;
  email: string;
}): string {
  const primary = userDisplayName({
    username: peer.username,
    name: typeof peer.name === "string" ? peer.name : "",
  }).trim();
  if (primary.length > 0) return primary;
  const em = typeof peer.email === "string" ? peer.email.trim() : "";
  if (em.length > 0) {
    const at = em.indexOf("@");
    return at > 0 ? em.slice(0, at) : em;
  }
  return `用户 ${peer.id.slice(0, 8)}`;
}
