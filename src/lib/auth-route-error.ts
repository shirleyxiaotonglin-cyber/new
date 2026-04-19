import { NextResponse } from "next/server";

/** 将登录/注册中的异常转为 JSON，避免 Vercel 返回 HTML 导致前端「请求失败」 */
export function authRouteError(e: unknown, context: string): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[${context}]`, e);

  if (msg.includes("JWT_SECRET")) {
    return NextResponse.json(
      {
        error:
          "服务器未配置 JWT_SECRET（至少 16 位）。请在 Vercel → Settings → Environment Variables 添加后 Redeploy。",
        code: "JWT_SECRET_MISSING",
      },
      { status: 503 },
    );
  }

  if (
    msg.includes("Can't reach database") ||
    msg.includes("P1001") ||
    msg.includes("connection")
  ) {
    return NextResponse.json(
      {
        error: "无法连接数据库，请检查 DATABASE_URL / DIRECT_URL 是否在托管平台已配置。",
        code: "DATABASE_UNREACHABLE",
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: "服务器异常，请稍后重试。", code: "INTERNAL" },
    { status: 500 },
  );
}
