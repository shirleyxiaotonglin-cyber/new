import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDeleteProject, effectiveOrgRole, requireOrgMember } from "@/lib/access";
import { getPrimaryOrgMembership } from "@/lib/workspace";
import { ProjectStatus } from "@/lib/constants";

/**
 * 当前用户「我的项目」：所有已加入的项目（跨业务组织），入口在唯一工作空间下。
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const primary = await getPrimaryOrgMembership(session.sub);
  if (!primary) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.projectMember.findMany({
    where: { userId: session.sub },
    include: {
      project: {
        include: {
          org: { select: { id: true, name: true } },
          _count: { select: { tasks: true } },
        },
      },
    },
  });

  const dedup = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    dedup.set(row.projectId, row);
  }

  const projects = [];
  for (const row of Array.from(dedup.values())) {
    const p = row.project;
    if (p.status === ProjectStatus.ARCHIVED) continue;
    const om = await requireOrgMember(p.orgId, session.sub);
    const canDel = canDeleteProject(effectiveOrgRole(om), row.role);
    projects.push({
      id: p.id,
      name: p.name,
      description: p.description,
      template: p.template,
      taskCount: p._count.tasks,
      updatedAt: p.updatedAt.toISOString(),
      orgId: p.orgId,
      orgName: p.org.name,
      canDelete: canDel,
    });
  }

  projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return NextResponse.json({
    workspaceOrgId: primary.orgId,
    projects,
  });
}
