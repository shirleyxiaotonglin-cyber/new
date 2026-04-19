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
import { OrgRole } from "@/lib/constants";
import { z } from "zod";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  orgName: z.string().min(1).optional(),
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
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const { password, name, orgName, remember } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录。" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const slugBase = (orgName ?? name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        orgMemberships: {
          create: {
            role: OrgRole.OWNER,
            org: {
              create: {
                name: orgName ?? `${name}'s Workspace`,
                slug,
              },
            },
          },
        },
      },
    });

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
    return authRouteError(e, "auth/register");
  }
}
