import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkReportsAiPanel } from "@/components/org/WorkReportsAiPanel";
import { ensurePrimaryOrgPage } from "@/lib/workspace";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const primary = await ensurePrimaryOrgPage(orgId, session.sub, "/reports");

  const myTasks = await prisma.task.findMany({
    where: {
      assigneeId: session.sub,
      parentId: null,
    },
    select: { id: true, projectId: true, project: { select: { orgId: true } } },
    take: 200,
  });

  const taskProjectHrefByTaskId = Object.fromEntries(
    myTasks.map((t) => [
      t.id,
      `/org/${t.project.orgId}/project/${t.projectId}`,
    ]),
  );

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">工作报告</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">今日 / 本周 / 本月工作报告</h1>
        <p className="mt-2 text-sm text-gray-600">
          工作空间：<span className="font-medium text-gray-800">{primary.org.name}</span>
          · 基于分配给你的任务（跨项目）由 AI 汇总。
        </p>
      </header>

      <WorkReportsAiPanel orgId={primary.orgId} taskProjectHrefByTaskId={taskProjectHrefByTaskId} />
    </div>
  );
}
