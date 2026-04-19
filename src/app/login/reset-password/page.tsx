"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    if (password !== password2) {
      setError("两次密码不一致");
      return;
    }
    if (!token) {
      setError("链接缺少 token，请从邮件完整打开。");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "重置失败");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <p className="text-sm text-amber-800">
        链接无效。请从「忘记密码」邮件中打开完整链接，或返回
        <Link href="/login/forgot" className="mx-1 text-red-600 underline">
          重新申请
        </Link>
        。
      </p>
    );
  }

  if (done) {
    return (
      <p className="text-sm text-green-700">密码已更新，正在跳转到登录页…</p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-600">新密码</label>
        <input
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
        />
      </div>
      <div>
        <label className="text-xs font-medium text-gray-600">确认新密码</label>
        <input
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          type="password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="button"
        disabled={loading}
        className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        onClick={() => void submit()}
      >
        {loading ? "提交中…" : "确认重置"}
      </button>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <h1 className="text-xl font-semibold text-gray-900">设置新密码</h1>
        <Suspense fallback={<p className="mt-4 text-sm text-gray-500">加载中…</p>}>
          <div className="mt-6">
            <ResetForm />
          </div>
        </Suspense>
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-red-600 hover:text-red-700">
            返回登录
          </Link>
        </p>
      </div>
    </div>
  );
}
