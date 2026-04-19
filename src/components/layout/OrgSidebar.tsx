"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CheckSquare,
  FileText,
  FolderKanban,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";
import type { OrgNavUser } from "@/components/layout/OrgNavUserSummary";
import { OrgNavUserSidebarCard } from "@/components/layout/OrgNavUserSummary";

export function OrgSidebar({
  orgId,
  orgName,
  navUser,
  orgSwitcherOrgs,
}: {
  orgId: string;
  orgName: string;
  navUser: OrgNavUser;
  /** 用户加入的多个工作区，用于手动切换；与「被拉进某组织后默认进该空间」的登录策略配合 */
  orgSwitcherOrgs: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const base = `/org/${orgId}`;

  function activeProjectMgmt() {
    return (
      pathname.startsWith(`${base}/projects`) || pathname.includes(`${base}/project/`)
    );
  }

  const items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    match: () => boolean;
  }[] = [
    {
      href: `${base}/projects`,
      label: "项目管理",
      icon: FolderKanban,
      match: activeProjectMgmt,
    },
    {
      href: `${base}/my-tasks`,
      label: "我的任务",
      icon: CheckSquare,
      match: () => pathname.startsWith(`${base}/my-tasks`),
    },
    {
      href: `${base}/messages`,
      label: "消息中心",
      icon: Bell,
      match: () => pathname.startsWith(`${base}/messages`),
    },
    {
      href: `${base}/reports`,
      label: "工作报告",
      icon: FileText,
      match: () => pathname.startsWith(`${base}/reports`),
    },
    {
      href: `${base}/profile`,
      label: "个人中心",
      icon: User,
      match: () => pathname.startsWith(`${base}/profile`),
    },
  ];

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  }

  return (
    <aside className="flex h-full min-h-screen w-60 shrink-0 flex-col bg-red-600 text-white shadow-md md:h-auto">
      <div className="border-b border-red-500 px-4 pb-5 pt-6 md:pt-12">
        <Link href="/" className="block text-[15px] font-bold leading-snug tracking-tight text-white">
          {PRODUCT_NAME}
        </Link>
        <p className="mt-2 text-[11px] leading-relaxed text-red-100/95">{PRODUCT_TAGLINE}</p>
        <p className="mt-3 truncate border-t border-red-500/50 pt-3 text-sm font-medium text-red-50" title={orgName}>
          {orgName}
        </p>
        {orgSwitcherOrgs.length > 1 ? (
          <div className="mt-2 border-t border-red-500/50 pt-2">
            <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-200/90">
              切换工作空间
            </p>
            <ul className="mt-1.5 max-h-32 space-y-0.5 overflow-y-auto text-sm">
              {orgSwitcherOrgs.map((o) => (
                <li key={o.id}>
                  {o.id === orgId ?
                    <span className="block truncate rounded-md bg-red-800/50 px-2 py-1.5 font-medium text-white">
                      {o.name}
                    </span>
                  : <Link
                      href={`/org/${o.id}/projects`}
                      className="block truncate rounded-md px-2 py-1.5 text-red-50/95 transition hover:bg-red-700/60"
                      title={o.name}
                    >
                      {o.name}
                    </Link>
                  }
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-3 border-t border-red-500/50 pt-3">
          <OrgNavUserSidebarCard user={navUser} />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-red-200">
          导航
        </p>
        <ul className="space-y-0.5">
          {items.map(({ href, label, icon: Icon, match }) => {
            const active = match();
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-red-800 font-medium text-white shadow-sm"
                      : "text-red-50 hover:bg-red-700",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-red-500 p-3">
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-medium text-red-600 shadow-sm transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </aside>
  );
}
