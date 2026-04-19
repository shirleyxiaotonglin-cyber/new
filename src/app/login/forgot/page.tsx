"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    setResetUrl(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        resetUrl?: string;
        error?: unknown;
      };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "提交失败");
        return;
      }
      setDone(true);
      setMessage(typeof j.message === "string" ? j.message : null);
      if (typeof j.resetUrl === "string") setResetUrl(j.resetUrl);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-10 text-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-gray-900">忘记密码</h1>
        <p className="mt-2 text-sm text-gray-500">
          输入注册邮箱，将收到重置链接（需管理员配置邮件服务时才可收信）。
        </p>

        {!done ? (
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">邮箱</label>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={loading || !email.trim()}
              className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              onClick={() => void submit()}
            >
              {loading ? "提交中…" : "发送重置邮件"}
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4 text-sm text-gray-700">
            <p>{message ?? "请求已处理。"}</p>
            {resetUrl ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                <p className="font-medium">开发模式一次性链接（勿用于生产）：</p>
                <Link href={resetUrl} className="mt-1 block break-all text-red-700 underline">
                  {resetUrl}
                </Link>
              </div>
            ) : null}
            <p className="text-xs text-gray-500">
              也可返回使用
              <Link href="/login" className="mx-1 font-medium text-red-600">
                演示账号登录
              </Link>
              进入系统。
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-red-600 hover:text-red-700">
            ← 返回登录
          </Link>
        </p>
      </div>
    </div>
  );
}
