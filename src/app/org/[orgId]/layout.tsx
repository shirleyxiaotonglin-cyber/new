import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { OrgNavUser } from "@/components/layout/OrgNavUserSummary";
import { OrgAppShell } from "@/components/layout/OrgAppShell";
import { OrgSidebar } from "@/components/layout/OrgSidebar";
import { getPrimaryOrgMembership, hasProjectMembershipInOrg } from "@/lib/workspace";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  /** 每人唯一展示用的工作空间（首个组织成员身份） */
  const workspaceMember = await getPrimaryOrgMembership(session.sub);
  if (!workspaceMember) redirect("/login");

  /** URL 中的组织：可为项目所属业务组织（仅项目成员、非组织成员也可进入项目页） */
  const memberForRoute = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
  });
  const allowed =
    memberForRoute !== null || (await hasProjectMembershipInOrg(orgId, session.sub));
  if (!allowed) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { name: true, email: true, username: true, avatarUrl: true },
  });

  const deptRaw =
    workspaceMember.departmentText?.trim() || workspaceMember.department?.name?.trim() || "";
  const department = deptRaw.length > 0 ? deptRaw : null;
  const usernameTrimmed = user?.username?.trim();
  const navUser: OrgNavUser = {
    orgId: workspaceMember.orgId,
    name: user?.name ?? user?.email ?? "用户",
    username: usernameTrimmed && usernameTrimmed.length > 0 ? usernameTrimmed : null,
    email: user?.email ?? "",
    avatarUrl: user?.avatarUrl ?? null,
    department,
  };

  return (
    <OrgAppShell
      navUser={navUser}
      sidebar={
        <OrgSidebar
          workspaceOrgId={workspaceMember.orgId}
          workspaceOrgName={workspaceMember.org.name}
          navUser={navUser}
        />
      }
    >
      {children}
    </OrgAppShell>
  );
}
