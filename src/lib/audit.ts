import { prisma } from "./prisma";

export async function writeAudit(
  orgId: string,
  userId: string | null,
  resource: string,
  action: string,
  diff?: Record<string, unknown>,
  ip?: string | null,
) {
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: userId ?? undefined,
      resource,
      action,
      diff: diff ? JSON.stringify(diff) : null,
      ip: ip ?? undefined,
    },
  });
}
