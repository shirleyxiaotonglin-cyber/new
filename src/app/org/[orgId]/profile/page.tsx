import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileSettingsForm } from "@/components/org/ProfileSettingsForm";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const [member, departments] = await Promise.all([
    prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: session.sub } },
      include: {
        org: true,
        user: true,
        department: { select: { id: true, name: true } },
      },
    }),
    prisma.department.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!member) redirect("/login");

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">个人中心</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">账号与资料</h1>
        <p className="mt-2 text-sm text-gray-600">
          修改用户名、姓名、邮箱与头像；在当前组织下可选择部门（由组织预先创建部门列表）。
        </p>
      </header>

      <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <ProfileSettingsForm
          orgId={orgId}
          departments={departments}
          initial={{
            name: member.user.name,
            email: member.user.email,
            username: member.user.username,
            avatarUrl: member.user.avatarUrl,
            orgRole: member.role,
            orgName: member.org.name,
            departmentId: member.department?.id ?? null,
            departmentName: member.department?.name ?? null,
          }}
        />
      </div>
    </div>
  );
}
