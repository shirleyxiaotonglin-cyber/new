/**
 * 带登录态的请求，并禁止 HTTP 缓存，使对话/讨论等数据与数据库一致（刷新不读旧缓存）。
 */
export const sessionFetchInit: RequestInit = {
  credentials: "include",
  cache: "no-store",
};
