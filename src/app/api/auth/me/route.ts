import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  COOKIE,
  getSession,
  getSessionCookieOptions,
  SESSION_LONG_DAYS,
  signSessionToken,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  username: z
    .union([
      z
        .string()
        .min(2)
        .max(32)
        .regex(/^[a-zA-Z0-9_\-\u4e00-\u9fff]+$/),
      z.literal(""),
    ])
    .optional(),
  email: z.string().email().optional(),
  /** 修改邮箱时必须提供当前密码 */
  currentPassword: z.string().optional(),
  avatarUrl: z.union([z.string().url().max(2048), z.literal("")]).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, username: true, name: true, avatarUrl: true },
  });
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const orgs = await prisma.orgMember.findMany({
    where: { userId: user.id },
    include: { org: { select: { id: true, name: true, slug: true } } },
  });
  return NextResponse.json({
    user,
    organizations: orgs.map((o) => ({
      ...o.org,
      role: o.role,
    })),
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const row = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d = parsed.data;
  const emailNormalized = d.email?.trim().toLowerCase();

  if (emailNormalized !== undefined && emailNormalized !== row.email) {
    if (!d.currentPassword?.length) {
      return NextResponse.json({ error: "修改邮箱需填写当前密码" }, { status: 400 });
    }
    const pwdOk = await bcrypt.compare(d.currentPassword, row.passwordHash);
    if (!pwdOk) {
      return NextResponse.json({ error: "当前密码错误" }, { status: 401 });
    }
    const taken = await prisma.user.findUnique({ where: { email: emailNormalized } });
    if (taken && taken.id !== row.id) {
      return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 400 });
    }
  }

  if (d.username !== undefined && d.username !== "") {
    const taken = await prisma.user.findFirst({
      where: { username: d.username, NOT: { id: row.id } },
    });
    if (taken) {
      return NextResponse.json({ error: "用户名已被占用" }, { status: 400 });
    }
  }

  const data: {
    name?: string;
    email?: string;
    username?: string | null;
    avatarUrl?: string | null;
  } = {};

  if (d.name !== undefined) data.name = d.name;
  if (emailNormalized !== undefined && emailNormalized !== row.email) {
    data.email = emailNormalized;
  }
  if (d.username !== undefined) {
    data.username = d.username === "" ? null : d.username;
  }
  if (d.avatarUrl !== undefined) {
    data.avatarUrl = d.avatarUrl === "" ? null : d.avatarUrl;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: row.id },
    data,
    select: { id: true, email: true, username: true, name: true, avatarUrl: true },
  });

  const res = NextResponse.json({ user: updated });

  if (data.email !== undefined) {
    const token = await signSessionToken(
      { sub: updated.id, email: updated.email },
      { expiresInDays: SESSION_LONG_DAYS },
    );
    res.cookies.set(COOKIE, token, getSessionCookieOptions(SESSION_LONG_DAYS));
  }

  return res;
}

