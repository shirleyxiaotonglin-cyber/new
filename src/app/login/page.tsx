"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseApiError } from "@/lib/parse-api-error";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";

type Mode = "login" | "register";

async function redirectAfterAuth(router: ReturnType<typeof useRouter>) {
  const meRes = await fetch("/api/auth/me", { credentials: "include" });
  if (!meRes.ok) {
    return {
      ok: false as const,
      error: "会话已建立但无法读取用户信息，请刷新页面重试。",
    };
  }
  const me = (await meRes.json().catch(() => ({}))) as {
    organizations?: { id: string }[];
  };
  const firstOrg = me.organizations?.[0];
  if (firstOrg) {
    router.push(`/org/${firstOrg.id}`);
    return { ok: true as const };
  }
  return {
    ok: false as const,
    error:
      "当前账号还没有组织。请先完成注册创建工作空间，或在服务器执行 npm run db:seed（演示数据）。",
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
          remember,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }
      const redir = await redirectAfterAuth(router);
      if (!redir.ok) setError(redir.error);
    } catch (e) {
      setError(e instanceof Error ? `网络异常：${e.message}` : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function submitRegister() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || email.split("@")[0] || "用户",
          orgName: orgName.trim() || undefined,
          remember,
        }),
      });
      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }
      const redir = await redirectAfterAuth(router);
      if (!redir.ok) setError(redir.error);
    } catch (e) {
      setError(e instanceof Error ? `网络异常：${e.message}` : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ remember }),
      });
      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }
      const redir = await redirectAfterAuth(router);
      if (!redir.ok) setError(redir.error);
    } catch (e) {
      setError(e instanceof Error ? `网络异常：${e.message}` : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-10 text-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <h1 className="text-center text-xl font-bold leading-snug tracking-tight text-red-600 sm:text-2xl">
          {PRODUCT_NAME}
        </h1>
        <p className="mt-2 text-center text-xs leading-relaxed text-gray-500 sm:text-sm">{PRODUCT_TAGLINE}</p>

        <div className="mt-6 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
            }`}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
              mode === "register" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
            }`}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
          >
            注册
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600">邮箱</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">密码</label>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "register" ? "至少 8 位" : ""}
            />
          </div>

          {mode === "register" ? (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600">昵称 / 姓名</label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="用于显示的名称"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  工作空间名称 <span className="font-normal text-gray-400">（可选）</span>
                </label>
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="默认为「昵称的工作空间」"
                />
              </div>
            </>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            在此设备记住我（约 30 天）；关闭则短期有效（约 1 天）
          </label>

          {mode === "login" ? (
            <div className="text-right">
              <Link
                href="/login/forgot"
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                忘记密码？
              </Link>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex flex-col gap-3">
            {mode === "login" ? (
              <button
                type="button"
                disabled={loading || !email || !password}
                className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                onClick={() => void submitLogin()}
              >
                {loading ? "处理中…" : "登录"}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading || !email || password.length < 8}
                className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                onClick={() => void submitRegister()}
              >
                {loading ? "处理中…" : "注册并进入"}
              </button>
            )}

            <p className="border-t border-gray-100 pt-4 text-center text-xs text-gray-400">或</p>

            <button
              type="button"
              disabled={loading}
              className="w-full rounded-lg border border-dashed border-red-300 bg-red-50 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              onClick={() => void demoLogin()}
            >
              {loading ? "处理中…" : "一键演示账号登录"}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-gray-500">
              演示账号：demo@projecthub.io / demo123456。
              <br />
              若生产库从未执行 seed，点击上方按钮会自动创建演示数据。
            </p>
          </div>
        </div>
      </div>

      <Link href="/" className="mt-8 text-sm text-gray-500 hover:text-red-600">
        返回首页
      </Link>
    </div>
  );
}
