import type { Prisma } from "@prisma/client";

/** 组织内与当前用户相关的顶级任务：负责人为我，或我为协助人 */
export function tasksInvolvingMember(orgId: string, userId: string): Prisma.TaskWhereInput {
  return {
    project: { orgId },
    parentId: null,
    OR: [{ assigneeId: userId }, { assistants: { some: { userId } } }],
  };
}
