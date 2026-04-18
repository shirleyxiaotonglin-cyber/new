import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function MessagesPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
  });
  if (!member) redirect("/login");

  const list = await prisma.notification.findMany({
    where: { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">消息中心</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">通知与提醒</h1>
      </header>
      <ul className="mx-auto mt-8 max-w-3xl space-y-3">
        {list.map((n) => (
          <li
            key={n.id}
            className={`rounded-xl border px-4 py-3 ${n.read ? "border-gray-100 bg-gray-50" : "border-red-100 bg-red-50/50"}`}
          >
            <p className="font-medium text-gray-900">{n.title}</p>
            {n.body && <p className="mt-1 text-sm text-gray-600">{n.body}</p>}
            <p className="mt-2 text-xs text-gray-400">
              {format(n.createdAt, "yyyy-MM-dd HH:mm")}
            </p>
          </li>
        ))}
      </ul>
      {list.length === 0 && (
        <p className="mt-12 text-center text-gray-500">暂无消息。</p>
      )}
    </div>
  );
}
