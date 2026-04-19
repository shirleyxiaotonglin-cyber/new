import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { getPrimaryOrgMembership } from "@/lib/workspace";

/** 旧书签 /assets：统一到项目工作台并带上视图参数，以保持与其它标签一致的顶栏 */
export default async function ProjectAssetsPage({
  params,
}: {
  params: Promise<{ orgId: string; projectId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { projectId } = await params;

  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) redirect("/login");

  const primary = await getPrimaryOrgMembership(session.sub);
  if (!primary) redirect("/login");

  redirect(`/org/${primary.orgId}/project/${projectId}?view=assets`);
}
