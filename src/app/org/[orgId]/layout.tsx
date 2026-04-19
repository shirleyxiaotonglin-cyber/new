import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { OrgNavUser } from "@/components/layout/OrgNavUserSummary";
import { OrgAppShell } from "@/components/layout/OrgAppShell";
import { OrgSidebar } from "@/components/layout/OrgSidebar";

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

  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
    include: {
      org: true,
      department: { select: { name: true } },
    },
  });
  if (!member) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { name: true, email: true, username: true, avatarUrl: true },
  });

  const deptRaw =
    member.departmentText?.trim() || member.department?.name?.trim() || "";
  const department = deptRaw.length > 0 ? deptRaw : null;
  const usernameTrimmed = user?.username?.trim();
  const navUser: OrgNavUser = {
    orgId,
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
        <OrgSidebar orgId={orgId} orgName={member.org.name} navUser={navUser} />
      }
    >
      {children}
    </OrgAppShell>
  );
}
