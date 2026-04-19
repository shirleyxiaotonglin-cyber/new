import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OrgRole, ProjectMemberRole } from "@/lib/constants";

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 查找已注册用户（邮箱不区分大小写） */
export async function findRegisteredUserByEmail(email: string) {
  const n = normalizeInviteEmail(email);
  if (!n.includes("@")) return null;
  return prisma.user.findFirst({
    where: { email: { equals: n, mode: "insensitive" } },
    select: { id: true, email: true, name: true, username: true },
  });
}

/** 将用户纳入组织与普通项目成员（幂等），便于任务负责人/协作人可见 */
export async function ensureOrgAndProjectMember(
  tx: Prisma.TransactionClient,
  params: { orgId: string; projectId: string; userId: string },
): Promise<void> {
  await tx.orgMember.upsert({
    where: { orgId_userId: { orgId: params.orgId, userId: params.userId } },
    create: {
      orgId: params.orgId,
      userId: params.userId,
      role: OrgRole.MEMBER,
    },
    update: {},
  });
  await tx.projectMember.upsert({
    where: {
      projectId_userId: { projectId: params.projectId, userId: params.userId },
    },
    create: {
      projectId: params.projectId,
      userId: params.userId,
      role: ProjectMemberRole.MEMBER,
    },
    update: {},
  });
}
