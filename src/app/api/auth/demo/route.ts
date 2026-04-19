import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  signSessionToken,
  COOKIE,
  getSessionCookieOptions,
  SESSION_LONG_DAYS,
  SESSION_SHORT_DAYS,
} from "@/lib/auth";
import { authRouteError } from "@/lib/auth-route-error";
import { ensureDemoUserAndOrg, DEMO_EMAIL } from "@/lib/demo-account";

const Body = z.object({
  remember: z.boolean().optional(),
});

/**
 * 一键演示登录：若无演示用户则写入数据库后再发会话。
 * 生产环境默认关闭（避免误切到演示账号）；需 NEXT_PUBLIC_ENABLE_DEMO_LOGIN=true 与本变量一致。
 */
export async function POST(req: Request) {
  try {
    const demoAllowed =
      process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";
    if (!demoAllowed) {
      return NextResponse.json(
        { error: "演示登录已在当前环境关闭。请使用邮箱登录，或联系管理员开启 NEXT_PUBLIC_ENABLE_DEMO_LOGIN。" },
        { status: 403 },
      );
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      json = {};
    }
    const parsed = Body.safeParse(json);
    const remember = parsed.success ? parsed.data.remember !== false : true;

    await ensureDemoUserAndOrg();

    const user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ error: "演示账号初始化失败" }, { status: 500 });
    }

    const days = remember ? SESSION_LONG_DAYS : SESSION_SHORT_DAYS;
    const token = await signSessionToken(
      { sub: user.id, email: user.email },
      { expiresInDays: days },
    );

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      demo: true,
    });
    res.cookies.set(COOKIE, token, getSessionCookieOptions(days));
    return res;
  } catch (e) {
    return authRouteError(e, "auth/demo");
  }
}
