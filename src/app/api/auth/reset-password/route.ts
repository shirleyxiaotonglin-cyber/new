import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  token: z.string().min(16),
  password: z.string().min(8),
});

export async function POST(req: Request) {
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

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!row || row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { error: "链接无效或已过期，请重新申请重置。" },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
