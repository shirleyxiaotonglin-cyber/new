import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ProjectMemberRole } from "@/lib/constants";

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

/**
 * 将用户纳入项目成员（幂等）。
 * 被指派负责人/协作人时只加入项目，不创建额外「组织」成员身份，项目会出现在对方唯一工作空间的「我的项目」中。
 */
export async function ensureProjectMember(
  tx: Prisma.TransactionClient,
  params: { projectId: string; userId: string },
): Promise<void> {
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
