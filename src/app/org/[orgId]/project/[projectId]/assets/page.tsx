import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";

/** 旧书签 /assets：统一到项目工作台并带上视图参数，以保持与其它标签一致的顶栏 */
export default async function ProjectAssetsPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId, projectId } = await params;

  const access = await requireProjectAccess(projectId, session.sub);
  if (!access || access.project.orgId !== orgId) redirect("/login");

  redirect(`/org/${orgId}/project/${projectId}?view=assets`);
}
