import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function MyTasksPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
    include: { org: true },
  });
  if (!member) redirect("/login");

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: session.sub,
      project: { orgId },
      parentId: null,
    },
    orderBy: [{ dueDate: "asc" }],
    include: { project: { select: { id: true, name: true } } },
    take: 100,
  });

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">我的任务</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">分配给我的工作项</h1>
      </header>
      <ul className="mx-auto mt-8 max-w-4xl space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link
              href={`/org/${orgId}/project/${t.projectId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 hover:border-red-200"
            >
              <span className="font-medium text-gray-900">{t.title}</span>
              <span className="text-sm text-gray-500">{t.project.name}</span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t.status}</span>
            </Link>
          </li>
        ))}
      </ul>
      {tasks.length === 0 && (
        <p className="mt-12 text-center text-gray-500">暂无分配给你的任务。</p>
      )}
    </div>
  );
}
