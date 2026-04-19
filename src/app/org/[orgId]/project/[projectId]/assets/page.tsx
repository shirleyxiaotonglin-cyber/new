import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ProjectAssetsHub } from "@/components/project/ProjectAssetsHub";

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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 px-4 py-6 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-red-600">项目资源库</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">{project?.name ?? "项目"}</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          汇总本项目所有任务上传的交付物；文件存储在 Supabase Storage（或部署所配置的对象存储），数据库记录任务与文件的绑定关系。
        </p>
        <Link
          href={`/org/${orgId}/project/${projectId}`}
          className="mt-3 inline-flex text-sm text-gray-500 hover:text-red-600"
        >
          ← 返回项目工作台
        </Link>
      </header>
      <ProjectAssetsHub orgId={orgId} projectId={projectId} />
    </div>
  );
}
