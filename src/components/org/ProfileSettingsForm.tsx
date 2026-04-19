"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Save } from "lucide-react";
import { compressAvatarForUpload } from "@/lib/compress-avatar-client";

function formatAvatarUploadError(payload: Record<string, unknown>): string {
  const err = payload.error;
  if (typeof err === "string" && err.trim()) return err;
  if (err != null) {
    try {
      const s = JSON.stringify(err);
      return s.length > 160 ? `上传失败：${s.slice(0, 160)}…` : `上传失败：${s}`;
    } catch {
      return "上传失败（服务器返回了无法解析的信息）";
    }
  }
  return "上传失败，请稍后再试或换一张较小的 JPG/PNG。";
}

export type ProfileSettingsFormProps = {
  orgId: string;
  initial: {
    name: string;
    email: string;
    username: string | null;
    avatarUrl: string | null;
    orgRole: string;
    orgName: string;
    /** 自填部门；空则回退显示曾选的组织部门名 */
    departmentText: string | null;
    departmentName: string | null;
  };
};

export function ProfileSettingsForm({ orgId, initial }: ProfileSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [username, setUsername] = useState(initial.username ?? "");
  const [email, setEmail] = useState(initial.email);
  const [emailDirty, setEmailDirty] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [departmentLabel, setDepartmentLabel] = useState(
    () => (initial.departmentText?.trim() || initial.departmentName || "").trim(),
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const emailChanged = useMemo(() => email.trim().toLowerCase() !== initial.email.toLowerCase(), [email, initial.email]);

  const showPwdHint = emailChanged || emailDirty;

  /** 上传过程中勿用旧的 RSC props 覆盖本地预览，避免误判「上传失败」 */
  useEffect(() => {
    if (uploading) return;
    setAvatarUrl(initial.avatarUrl);
  }, [initial.avatarUrl, uploading]);

  const onPickAvatar = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setUploading(true);
      setMessage(null);
      try {
        let toUpload: File;
        try {
          toUpload = await compressAvatarForUpload(file);
        } catch {
          setMessage({
            type: "err",
            text:
              "头像图片处理失败。请换一张 JPG/PNG，或在 iPhone「照片」中将图片共享/存储为 JPG 后再选。",
          });
          return;
        }
        const fd = new FormData();
        fd.append("file", toUpload);
        const res = await fetch("/api/me/avatar", {
          method: "POST",
          body: fd,
          credentials: "include",
        });

        const raw = await res.text();
        let j: Record<string, unknown> = {};
        if (raw) {
          try {
            j = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            setMessage({
              type: "err",
              text:
                res.status === 413 ?
                  "上传体积超过限制，请换一张更小的图片。"
                : `上传失败（HTTP ${res.status}）。若持续出现，请稍后再试。`,
            });
            return;
          }
        }

        if (!res.ok) {
          const base = formatAvatarUploadError(j);
          const code =
            typeof j.code === "string" && j.code
              ? `（错误码 ${j.code}${j.code === "P1001" ? "：数据库未连上" : ""}）`
              : "";
          const hint =
            process.env.NODE_ENV === "development" && typeof j.detail === "string"
              ? `\n${j.detail}`
              : "";
          setMessage({ type: "err", text: `${base}${code}${hint}` });
          return;
        }

        const okFlag = j.ok === true;
        const legacyUrl = typeof j.avatarUrl === "string" ? j.avatarUrl : null;
        if (okFlag || legacyUrl) {
          if (legacyUrl) setAvatarUrl(legacyUrl);
          setMessage({ type: "ok", text: "头像已更新" });
          router.refresh();
        } else {
          setMessage({
            type: "err",
            text: "保存结果异常，请刷新页面查看头像是否已更新。",
          });
        }
      } catch {
        setMessage({ type: "err", text: "网络异常，上传未完成。请检查连接后重试。" });
      } finally {
        setUploading(false);
      }
    },
    [router],
  );

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        username: username.trim(),
        email: email.trim().toLowerCase(),
      };
      if (emailChanged) {
        if (!currentPassword) {
          setMessage({ type: "err", text: "修改邮箱需填写当前密码" });
          setSaving(false);
          return;
        }
        body.currentPassword = currentPassword;
      }

      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { user?: unknown; error?: unknown };
      if (!res.ok) {
        const err =
          typeof j.error === "string"
            ? j.error
            : "保存失败";
        setMessage({ type: "err", text: err });
        return;
      }

      const deptRes = await fetch(`/api/org/${orgId}/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentText: departmentLabel.trim(),
        }),
      });
      const dj = (await deptRes.json()) as { error?: string };
      if (!deptRes.ok) {
        setMessage({
          type: "err",
          text: typeof dj.error === "string" ? dj.error : "资料已保存，但部门更新失败",
        });
        router.refresh();
        return;
      }

      setMessage({ type: "ok", text: "已保存" });
      setCurrentPassword("");
      router.refresh();
    } catch {
      setMessage({ type: "err", text: "网络异常" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {message ?
        <div
          role="status"
          className={
            message.type === "ok" ?
              "rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"
            : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          }
        >
          {message.text}
        </div>
      : null}

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="relative">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
            {avatarUrl ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            : <span className="text-2xl font-semibold text-gray-400">
                {name.slice(0, 1).toUpperCase()}
              </span>
            }
          </div>
          <label className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700">
            {uploading ?
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            : <Camera className="h-4 w-4" aria-hidden />}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={uploading}
              onChange={onPickAvatar}
            />
          </label>
        </div>
        <div className="text-center text-sm text-gray-600 sm:text-left">
          <p>支持 JPG / PNG / WebP / GIF，约 350KB 以内。</p>
          <p className="mt-1 text-xs text-gray-400">头像保存在账号上，全组织可见。</p>
          {avatarUrl ?
            <button
              type="button"
              className="mt-2 text-xs font-medium text-red-600 hover:underline"
              onClick={async () => {
                setMessage(null);
                const res = await fetch("/api/auth/me", {
                  method: "PATCH",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ avatarUrl: "" }),
                });
                if (res.ok) {
                  setAvatarUrl(null);
                  setMessage({ type: "ok", text: "已移除头像" });
                  router.refresh();
                } else {
                  const j = (await res.json()) as { error?: string };
                  setMessage({
                    type: "err",
                    text: typeof j.error === "string" ? j.error : "移除失败",
                  });
                }
              }}
            >
              移除头像
            </button>
          : null}
        </div>
      </div>

      <form onSubmit={saveProfile} className="space-y-5">
        <div>
          <label htmlFor="username" className="block text-xs font-medium text-gray-500">
            用户名
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            placeholder="字母、数字、下划线、中文等，2–32 字，可留空"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="name" className="block text-xs font-medium text-gray-500">
            姓名 <span className="text-red-600">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-medium text-gray-500">
            邮箱 <span className="text-red-600">*</span>
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailDirty(true);
            }}
            className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm"
          />
        </div>

        {showPwdHint ?
          <div>
            <label htmlFor="currentPassword" className="block text-xs font-medium text-gray-500">
              当前密码 {emailChanged ? <span className="text-red-600">（修改邮箱必填）</span> : null}
            </label>
            <input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm"
              placeholder={emailChanged ? "验证身份以修改邮箱" : "修改邮箱时需填写"}
            />
          </div>
        : null}

        <div>
          <label htmlFor="department" className="block text-xs font-medium text-gray-500">
            部门（本组织）
          </label>
          <input
            id="department"
            type="text"
            placeholder="例如：市场部、项目组 A、研发中心…"
            value={departmentLabel}
            onChange={(e) => setDepartmentLabel(e.target.value)}
            maxLength={120}
            className="mt-1 w-full max-w-md rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            自由填写即可，保存后在本组织成员资料中展示；留空表示不填部门。
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
        >
          {saving ?
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          : <Save className="h-4 w-4" aria-hidden />}
          保存资料
        </button>
      </form>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        <p>
          <span className="font-medium text-gray-800">当前空间角色：</span>
          {initial.orgRole}
        </p>
        <p className="mt-1">
          <span className="font-medium text-gray-800">组织：</span>
          {initial.orgName}
        </p>
      </div>
    </div>
  );
}
