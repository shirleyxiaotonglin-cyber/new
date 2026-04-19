"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

export type OrgNavUser = {
  orgId: string;
  name: string;
  username: string | null;
  /** 登录邮箱，侧栏与顶栏展示用 */
  email: string;
  avatarUrl: string | null;
  department: string | null;
};

function AvatarBubble({
  name,
  avatarUrl,
  sizeClass,
}: {
  name: string;
  avatarUrl: string | null;
  sizeClass: string;
}) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  if (avatarUrl && avatarUrl.length > 0) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover ring-2 ring-white/25", sizeClass)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-red-800 font-semibold text-white ring-2 ring-white/25",
        sizeClass,
      )}
    >
      <span className="text-[0.65em] leading-none">{initial}</span>
    </span>
  );
}

/** 侧栏顶部（组织名下）：头像 + 姓名 / 邮箱 / 部门 */
export function OrgNavUserSidebarCard({ user }: { user: OrgNavUser }) {
  const profileHref = `/org/${user.orgId}/profile`;

  return (
    <Link
      href={profileHref}
      className="flex gap-3 rounded-xl border border-red-500/40 bg-red-700/35 px-2 py-2.5 transition hover:bg-red-700/55"
    >
      <AvatarBubble name={user.name} avatarUrl={user.avatarUrl} sizeClass="h-11 w-11 text-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white" title={user.name}>
          {user.name}
        </p>
        {user.email ?
          <p className="truncate text-xs text-red-100/95" title={user.email}>
            {user.email}
          </p>
        : null}
        {user.department ?
          <p className="mt-0.5 truncate text-[11px] text-red-200/90" title={user.department}>
            {user.department}
          </p>
        : null}
      </div>
    </Link>
  );
}

/** 移动端顶栏右侧紧凑展示 */
export function OrgNavUserMobileChip({ user }: { user: OrgNavUser }) {
  const profileHref = `/org/${user.orgId}/profile`;
  const subParts: string[] = [];
  if (user.email?.trim()) subParts.push(user.email.trim());
  if (user.department?.trim()) subParts.push(user.department.trim());
  const subLine = subParts.join(" · ");

  return (
    <Link
      href={profileHref}
      className="flex max-w-[58vw] min-w-0 items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-red-700/80"
    >
      <AvatarBubble name={user.name} avatarUrl={user.avatarUrl} sizeClass="h-8 w-8 text-sm" />
      <div className="min-w-0 text-left leading-tight">
        <p className="truncate text-[11px] font-semibold text-white">{user.name}</p>
        {subLine ?
          <p className="truncate text-[10px] text-red-100/90" title={subLine}>
            {subLine}
          </p>
        : null}
      </div>
    </Link>
  );
}
