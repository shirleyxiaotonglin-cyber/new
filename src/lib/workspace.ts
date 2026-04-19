import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/** 每人唯一「工作空间」锚点：首次加入的组织（通常为注册时创建的个人空间） */
export async function getPrimaryOrgMembership(userId: string) {
  return prisma.orgMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    include: {
      org: true,
      department: { select: { name: true } },
    },
  });
}

/**
 * `/org/:orgId/project/:projectId` 中的 orgId 允许为项目所属业务组织，或当前用户唯一工作空间（主组织）。
 * 这样在主空间「加入项目」后可留在自己的 org 路径下打开协作项目。
 */
export function projectRouteOrgMatches(
  routeOrgId: string,
  projectOrgId: string,
  primaryOrgId: string,
): boolean {
  return routeOrgId === projectOrgId || routeOrgId === primaryOrgId;
}

/** 用户在指定组织下是否已有任一项目的成员身份（不含组织成员也可协作项目） */
export async function hasProjectMembershipInOrg(orgId: string, userId: string): Promise<boolean> {
  const n = await prisma.projectMember.count({
    where: { userId, project: { orgId } },
  });
  return n > 0;
}

/**
 * 业务页（项目列表 / 我的任务等）仅在「唯一工作空间」路径下展示；
 * 若误打开其它 orgId，重定向到主空间同一路径。
 */
export async function ensurePrimaryOrgPage(
  routeOrgId: string,
  userId: string,
  pathSuffix: string,
) {
  const primary = await getPrimaryOrgMembership(userId);
  if (!primary) redirect("/login");
  if (primary.orgId !== routeOrgId) {
    redirect(`/org/${primary.orgId}${pathSuffix}`);
  }
  return primary;
}
