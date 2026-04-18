import type { Prisma } from "@prisma/client";

/** 任务列表 / 详情 API 共用的关联查询 */
export const taskDetailInclude = {
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  tags: { include: { tag: true } },
  dependenciesPredecessors: {
    include: { predecessor: { select: { id: true, title: true, status: true } } },
  },
  subtasks: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      sortOrder: true,
    },
  },
  assistants: {
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  },
} satisfies Prisma.TaskInclude;
