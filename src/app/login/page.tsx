"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { parseApiError } from "@/lib/parse-api-error";
import { PRODUCT_TAGLINE } from "@/lib/product-brand";

type Mode = "login" | "register";

/** 服务端 /api/auth/demo：默认启用；生产关闭一键演示时设置 DISABLE_DEMO_LOGIN=true */
async function redirectAfterAuth(router: ReturnType<typeof useRouter>) {
  /** no-store：避免浏览器沿用上一位登录用户的 /api/auth/me 缓存响应 */
  const meRes = await fetch("/api/auth/me", {
    credentials: "include",
    cache: "no-store",
  });
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
      "当前账号还没有加入任何工作空间。请完成注册并创建组织，或联系管理员邀请您加入。",
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-100 px-4 py-10 text-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
        <h1 className="text-center text-xl font-bold leading-snug tracking-tight sm:text-2xl">
          <span className="text-red-600">ProjectHub</span>
          <span className="text-gray-900"> 多人协作项目管理平台</span>
        </h1>
        <p className="mt-2 text-center text-xs leading-relaxed text-gray-500 sm:text-sm">{PRODUCT_TAGLINE}</p>

        <div className="mt-6 flex gap-2 rounded-xl border border-gray-200 bg-gray-50/80 p-1.5">
          <button
            type="button"
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-medium transition",
              mode === "login" ?
                "border border-blue-500 bg-white text-blue-600 shadow-sm"
              : "border border-transparent text-gray-500 hover:text-gray-700",
            )}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
          >
            登录
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 rounded-lg py-2.5 text-sm font-medium transition",
              mode === "register" ?
                "border border-blue-500 bg-white text-blue-600 shadow-sm"
              : "border border-transparent text-gray-500 hover:text-gray-700",
            )}
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
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="默认为「昵称的工作空间」"
                />
              </div>
            </>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-gray-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>
              在此设备记住我（约 30 天）；关闭则短期有效（约 1 天）
            </span>
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
                className="w-full rounded-lg bg-red-600 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                onClick={() => void submitLogin()}
              >
                {loading ? "处理中…" : "登录"}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading || !email || password.length < 8}
                className="w-full rounded-lg bg-red-600 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                onClick={() => void submitRegister()}
              >
                {loading ? "处理中…" : "注册并进入"}
              </button>
            )}

            <>
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-3 text-gray-400">或</span>
                </div>
              </div>

              <button
                type="button"
                disabled={loading}
                className="w-full rounded-lg border border-dashed border-red-300 bg-red-50 py-3 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                onClick={() => void demoLogin()}
              >
                {loading ? "处理中…" : "演示账号一键登录"}
              </button>
            </>
          </div>
        </div>
      </div>

      <Link href="/" className="mt-8 text-sm text-gray-500 hover:text-red-600">
        返回首页
      </Link>
    </div>
  );
}
