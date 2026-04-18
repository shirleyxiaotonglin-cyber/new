import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
    include: { org: true },
  });
  if (!member) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { name: true, email: true },
  });

  return (
    <OrgAppShell
      sidebar={
        <OrgSidebar
          orgId={orgId}
          orgName={member.org.name}
          userName={user?.name ?? user?.email ?? "用户"}
        />
      }
    >
      {children}
    </OrgAppShell>
  );
}
