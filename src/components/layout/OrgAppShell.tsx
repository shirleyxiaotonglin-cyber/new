"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { PRODUCT_NAME } from "@/lib/product-brand";
import type { OrgNavUser } from "@/components/layout/OrgNavUserSummary";
import { OrgNavUserMobileChip } from "@/components/layout/OrgNavUserSummary";

export function OrgAppShell({
  sidebar,
  children,
  navUser,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  navUser: OrgNavUser;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-white">
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-red-700 bg-red-600 px-2 pl-3 pr-2 text-white shadow-sm md:hidden">
        <button
          type="button"
          className="shrink-0 rounded-lg p-2 hover:bg-red-700"
          aria-label="打开菜单"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-6 w-6" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-xs font-bold leading-tight tracking-tight">
          {PRODUCT_NAME}
        </span>
        <div className="shrink-0">
          <OrgNavUserMobileChip user={navUser} />
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[240px] max-w-[85vw] transition-transform duration-200 ease-out md:static md:z-0 md:max-w-none md:translate-x-0",
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
        )}
      >
        <button
          type="button"
          className="absolute right-2 top-2 z-10 rounded-lg bg-red-800/90 p-2 text-white md:hidden"
          aria-label="关闭菜单"
          onClick={() => setOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
        {sidebar}
      </div>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-label="关闭遮罩"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <main className="relative z-0 flex w-full min-w-0 flex-1 flex-col overflow-y-auto bg-white pt-14 text-gray-900 md:min-h-screen md:pt-0">
        {children}
      </main>
    </div>
  );
}
