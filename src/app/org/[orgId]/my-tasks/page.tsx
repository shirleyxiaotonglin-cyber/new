import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tasksInvolvingMember } from "@/lib/my-tasks-scope";
import { MyTasksBoard } from "@/components/org/MyTasksBoard";
import { MyTasksPlanPanel } from "@/components/org/MyTasksPlanPanel";

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
    where: tasksInvolvingMember(orgId, session.sub),
    orderBy: [{ dueDate: "asc" }],
    include: { project: { select: { id: true, name: true } } },
    take: 200,
  });

  const listItems = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    projectId: t.projectId,
    projectName: t.project.name,
  }));

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">我的任务</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">分配给我的工作项</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          包含<strong className="font-medium text-gray-800">分配给你</strong>的任务，以及你为
          <strong className="font-medium text-gray-800">协助人</strong>
          的任务。点击任务进入项目并打开详情，可填写任务内容、上传交付物等。
        </p>
      </header>

      <div className="mt-8">
        <MyTasksBoard orgId={orgId} tasks={listItems} />
      </div>

      <MyTasksPlanPanel
        orgId={orgId}
        taskProjectHrefByTaskId={Object.fromEntries(
          tasks.map((t) => [
            t.id,
            `/org/${orgId}/project/${t.projectId}?task=${encodeURIComponent(t.id)}`,
          ]),
        )}
      />
    </div>
  );
}
