import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { getPrimaryOrgMembership, projectRouteOrgMatches } from "@/lib/workspace";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";

function ProjectLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">
      加载项目…
    </div>
  );
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId, projectId } = await params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) redirect("/login");

  const primary = await getPrimaryOrgMembership(session.sub);
  if (!primary) redirect("/login");
  if (!projectRouteOrgMatches(orgId, access.project.orgId, primary.orgId)) {
    redirect(`/org/${primary.orgId}/project/${projectId}`);
  }

  /* key 强制在切换项目/组织时重置客户端状态，避免沿用上一个项目的任务/侧栏数据。
   * Suspense：ProjectWorkspace 使用 useSearchParams 解析 ?task= 深链 */
  return (
    <Suspense fallback={<ProjectLoading />}>
      <ProjectWorkspace
        key={`${orgId}:${projectId}`}
        orgId={orgId}
        projectId={projectId}
        defaultView="gantt"
      />
    </Suspense>
  );
}
