import { NextResponse } from "next/server";

/** 将登录/注册中的异常转为 JSON，避免 Vercel 返回 HTML 导致前端「请求失败」 */
export function authRouteError(e: unknown, context: string): NextResponse {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[${context}]`, e);

  if (msg.includes("JWT_SECRET")) {
    return NextResponse.json(
      {
        error: "登录服务未完成配置，暂时无法使用。请联系管理员处理。",
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
        error: "暂时无法连接到服务，请稍后再试。若持续出现，请联系管理员。",
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
