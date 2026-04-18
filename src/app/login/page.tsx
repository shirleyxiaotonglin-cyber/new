"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@projecthub.io");
  const [password, setPassword] = useState("demo123456");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(mode: "login" | "register") {
    setLoading(true);
    setError(null);
    const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      mode === "login"
        ? { email, password }
        : { email, password, name: email.split("@")[0] ?? "User" };
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError((j as { error?: string }).error ?? "请求失败");
      return;
    }
    const meRes = await fetch("/api/auth/me", { credentials: "include" });
    if (!meRes.ok) {
      setError("登录成功但无法读取会话，请刷新页面重试。");
      return;
    }
    const me = (await meRes.json().catch(() => ({}))) as {
      organizations?: { id: string }[];
    };
    const firstOrg = me.organizations?.[0];
    if (firstOrg) {
      router.push(`/org/${firstOrg.id}`);
      return;
    }
    setError(
      "当前账号没有可进入的组织。若是空数据库，请在项目根目录执行：npm run setup",
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <h1 className="text-center text-2xl font-bold tracking-tight text-red-600">ProjectHub</h1>
        <p className="mt-2 text-center text-sm text-gray-500">企业级多租户项目管理</p>
        <div className="mt-8 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600">邮箱</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">密码</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading}
              className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              onClick={() => void submit("login")}
            >
              登录
            </button>
            <button
              type="button"
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => void submit("register")}
            >
              注册
            </button>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">
          演示：demo@projecthub.io / demo123456
        </p>
      </div>
      <Link href="/" className="mt-8 text-sm text-gray-500 hover:text-red-600">
        返回首页
      </Link>
    </div>
  );
}
