/**
 * 可选：配置 RESEND_API_KEY + EMAIL_FROM 后发送重置邮件。
 * 未配置时仅创建重置令牌，由接口返回说明（见 forgot-password 路由）。
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    return { sent: false, reason: "not_configured" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: "重置 ProjectHub 密码",
      html: `
        <p>你好，</p>
        <p>请点击下方链接重置密码（1 小时内有效）：</p>
        <p><a href="${params.resetUrl}">${params.resetUrl}</a></p>
        <p>若不是你本人操作，请忽略此邮件。</p>
      `,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { sent: false, reason: text || `http_${res.status}` };
  }

  return { sent: true };
}
