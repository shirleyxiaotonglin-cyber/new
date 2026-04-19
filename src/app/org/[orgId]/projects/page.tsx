import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ProjectsHub } from "@/components/org/ProjectsHub";
import { ensurePrimaryOrgPage } from "@/lib/workspace";

export default async function OrgProjectsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const primary = await ensurePrimaryOrgPage(orgId, session.sub, "/projects");

  return <ProjectsHub workspaceOrgId={primary.orgId} workspaceOrgName={primary.org.name} />;
}
