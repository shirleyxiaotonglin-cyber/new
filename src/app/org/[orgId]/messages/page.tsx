import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MessagesCenterClient } from "@/components/org/MessagesCenterClient";
import { ensurePrimaryOrgPage } from "@/lib/workspace";

function MessagesFallback() {
  return (
    <div className="mx-auto mt-12 max-w-6xl text-center text-sm text-gray-500">加载消息中心…</div>
  );
}

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const primary = await ensurePrimaryOrgPage(orgId, session.sub, "/messages");

  const list = await prisma.notification.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const initialNotifications = list.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">消息中心</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">私信与通知</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          与组织成员的一对一聊天保存在「私信」，支持文字与附件（与任务交付物共用存储）；系统通知在「通知与提醒」。从项目任务详情点击「私聊」将跳转至本页并打开与对方的一对一会话。
        </p>
      </header>

      <Suspense fallback={<MessagesFallback />}>
        <MessagesCenterClient
          orgId={primary.orgId}
          currentUserId={session.sub}
          initialNotifications={initialNotifications}
        />
      </Suspense>
    </div>
  );
}
