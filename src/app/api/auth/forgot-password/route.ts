import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";

const Body = z.object({
  email: z.string().email(),
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

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  /* 统一提示，避免枚举邮箱是否存在 */
  const generic = {
    ok: true as const,
    message:
      "若该邮箱已注册，你将收到重置链接；若未收到，请检查垃圾箱或确认邮件服务已配置。",
  };

  if (!user) {
    return NextResponse.json(generic);
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const resetUrl = `${base}/login/reset-password?token=${encodeURIComponent(rawToken)}`;

  const mail = await sendPasswordResetEmail({ to: user.email, resetUrl });

  if (mail.sent) {
    return NextResponse.json({
      ok: true,
      message: "重置邮件已发送，请查收邮箱。",
    });
  }

  /* 未配置发信：开发环境返回链接便于调试；生产仅保留通用文案 */
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({
      ok: true,
      message:
        "开发模式：未配置 RESEND_API_KEY / EMAIL_FROM，以下为一次性重置链接（不要在生产暴露）。",
      resetUrl,
    });
  }

  return NextResponse.json({
    ok: true,
    message:
      generic.message +
      "（管理员尚未配置邮件服务时，请联系管理员重置或使用演示账号登录。）",
  });
}
