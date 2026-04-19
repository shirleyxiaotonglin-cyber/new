import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  signSessionToken,
  COOKIE,
  getSessionCookieOptions,
  SESSION_LONG_DAYS,
  SESSION_SHORT_DAYS,
} from "@/lib/auth";
import { authRouteError } from "@/lib/auth-route-error";
import { z } from "zod";

const Body = z.object({
  email: z.string().email(),
  password: z.string(),
  remember: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
    }
    const { email, password, remember } = parsed.data;
    const normalized = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalized },
    });
    if (!user) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    }
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
    }

    const days = remember === true ? SESSION_LONG_DAYS : SESSION_SHORT_DAYS;
    const token = await signSessionToken(
      { sub: user.id, email: user.email },
      { expiresInDays: days },
    );
    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
    res.cookies.set(COOKIE, token, getSessionCookieOptions(days));
    return res;
  } catch (e) {
    return authRouteError(e, "auth/login");
  }
}
