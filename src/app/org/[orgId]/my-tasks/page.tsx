import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { tasksInvolvingUserGlobal } from "@/lib/my-tasks-scope";
import { MyTasksBoard } from "@/components/org/MyTasksBoard";
import { MyTasksPlanPanel } from "@/components/org/MyTasksPlanPanel";
import { ensurePrimaryOrgPage } from "@/lib/workspace";

export default async function MyTasksPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const primary = await ensurePrimaryOrgPage(orgId, session.sub, "/my-tasks");

  const tasks = await prisma.task.findMany({
    where: tasksInvolvingUserGlobal(session.sub),
    orderBy: [{ dueDate: "asc" }],
    include: { project: { select: { id: true, name: true, orgId: true } } },
    take: 200,
  });

  const listItems = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    projectId: t.projectId,
    projectName: t.project.name,
    projectOrgId: t.project.orgId,
  }));

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">我的任务</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">分配给我的工作项</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          包含各项目中<strong className="font-medium text-gray-800">分配给你</strong>的任务，以及你为
          <strong className="font-medium text-gray-800">协助人</strong>
          的任务。点击任务进入对应项目并打开详情。
        </p>
      </header>

      <div className="mt-8">
        <MyTasksBoard
          workspaceOrgId={primary.orgId}
          tasks={listItems}
        />
      </div>

      <MyTasksPlanPanel
        orgId={primary.orgId}
        taskProjectHrefByTaskId={Object.fromEntries(
          tasks.map((t) => [
            t.id,
            `/org/${t.project.orgId}/project/${t.projectId}?task=${encodeURIComponent(t.id)}`,
          ]),
        )}
      />
    </div>
  );
}
