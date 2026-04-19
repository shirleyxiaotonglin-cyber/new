import { prisma } from "./prisma";
import { OrgRole, ProjectMemberRole } from "./constants";

export async function requireOrgMember(orgId: string, userId: string) {
  return prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
}

export async function requireProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: { where: { userId } } },
  });
  if (!project) return null;
  const projectMember = project.members[0];
  if (!projectMember) return null;
  const orgMember = await requireOrgMember(project.orgId, userId);
  if (!orgMember) return null;
  return { project, orgMember, projectMember };
}

function projectMemberCanEditTasks(projectRole: string) {
  return (
    projectRole === ProjectMemberRole.OWNER ||
    projectRole === ProjectMemberRole.ADMIN ||
    projectRole === ProjectMemberRole.MEMBER
  );
}

/** 任务编辑、交付物上传等同权：组织「访客」若已是本项目成员，仍可在项目内协作。 */
export function canEditTask(orgRole: string, projectRole: string) {
  if (orgRole === OrgRole.GUEST) return projectMemberCanEditTasks(projectRole);
  if (orgRole === OrgRole.OWNER || orgRole === OrgRole.ADMIN) return true;
  return projectMemberCanEditTasks(projectRole);
}

/** 与任务编辑权限一致：可上传交付物 */
export function canUploadDeliverable(orgRole: string, projectRole: string) {
  return canEditTask(orgRole, projectRole);
}

/** 删除：本人可删自己的；项目负责人/管理员可删任意 */
export function canDeleteDeliverable(
  orgRole: string,
  projectRole: string,
  uploaderId: string,
  userId: string,
) {
  if (uploaderId === userId) return canEditTask(orgRole, projectRole);
  return (
    orgRole === OrgRole.OWNER ||
    orgRole === OrgRole.ADMIN ||
    projectRole === ProjectMemberRole.OWNER ||
    projectRole === ProjectMemberRole.ADMIN
  );
}
