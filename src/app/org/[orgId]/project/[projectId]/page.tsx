import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { ProjectWorkspace } from "@/components/project/ProjectWorkspace";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId, projectId } = await params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access || access.project.orgId !== orgId) redirect("/login");

  /* key 强制在切换项目/组织时重置客户端状态，避免沿用上一个项目的任务/侧栏数据 */
  return (
    <ProjectWorkspace
      key={`${orgId}:${projectId}`}
      orgId={orgId}
      projectId={projectId}
      defaultView="gantt"
    />
  );
}
