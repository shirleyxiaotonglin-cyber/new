/** Domain string constants — stored in DB (SQLite-compatible). */

export const OrgRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  GUEST: "GUEST",
} as const;

export const ProjectTemplate = {
  ENGINEERING: "ENGINEERING",
  MARKETING: "MARKETING",
  LOCALIZATION: "LOCALIZATION",
  EVENT: "EVENT",
  CUSTOM: "CUSTOM",
} as const;

export const ProjectStatus = {
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
} as const;

export const ProjectMemberRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
  GUEST: "GUEST",
} as const;

export const TaskStatus = {
  TODO: "TODO",
  DOING: "DOING",
  DONE: "DONE",
  BLOCKED: "BLOCKED",
} as const;

export const TaskPriority = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
} as const;

export const ActivityAction = {
  TASK_CREATED: "TASK_CREATED",
  TASK_UPDATED: "TASK_UPDATED",
  TASK_STATUS: "TASK_STATUS",
  TASK_ASSIGNED: "TASK_ASSIGNED",
  COMMENT_ADDED: "COMMENT_ADDED",
  FILE_UPLOADED: "FILE_UPLOADED",
} as const;
