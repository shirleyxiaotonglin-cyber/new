import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FileText } from "lucide-react";

export default async function ReportsPage({
  params,
}: {
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

  return (
    <div className="min-h-screen bg-white px-4 py-8 sm:px-8">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">工作报告</p>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">周报 / 月报汇总</h1>
      </header>
      <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center">
        <FileText className="mx-auto h-12 w-12 text-red-300" />
        <p className="mt-4 text-gray-600">
          报告生成功能可对接「任务完成数据 + 日历周期」自动生成。当前为占位页，数据可在各项目「报表」视图查看。
        </p>
        <p className="mt-2 text-sm text-gray-500">组织：{member.org.name}</p>
      </div>
    </div>
  );
}
