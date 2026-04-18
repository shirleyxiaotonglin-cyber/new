import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { User } from "lucide-react";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { orgId } = await params;

  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
    include: { org: true, user: true },
  });
  if (!member) redirect("/login");

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">个人中心</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">账号与资料</h1>
      </header>
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-gray-200 p-8 shadow-sm">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <User className="h-8 w-8" />
          </div>
        </div>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="text-gray-500">姓名</dt>
            <dd className="mt-1 font-medium text-gray-900">{member.user.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">邮箱</dt>
            <dd className="mt-1 font-medium text-gray-900">{member.user.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">当前空间角色</dt>
            <dd className="mt-1 font-medium text-gray-900">{member.role}</dd>
          </div>
          <div>
            <dt className="text-gray-500">组织</dt>
            <dd className="mt-1 font-medium text-gray-900">{member.org.name}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
