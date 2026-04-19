import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { OrgRole } from "@/lib/constants";

export const DEMO_EMAIL = "435236356@qq.com";
export const DEMO_PASSWORD = "12345678";
export const DEMO_ORG_SLUG = "acme-corp";

/**
 * 确保演示账号与组织存在（与 prisma/seed 中的演示数据一致）。
 * 公网生产库若未执行 seed，演示登录按钮会先写入最小数据再发 Cookie。
 */
export async function ensureDemoUserAndOrg(): Promise<{ userId: string }> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: {
      email: DEMO_EMAIL,
      name: "Demo User",
      passwordHash,
    },
  });

  let org = await prisma.organization.findUnique({
    where: { slug: DEMO_ORG_SLUG },
  });

  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "ACME Corp",
        slug: DEMO_ORG_SLUG,
        members: {
          create: {
            userId: user.id,
            role: OrgRole.OWNER,
          },
        },
      },
    });
  } else {
    const member = await prisma.orgMember.findFirst({
      where: { orgId: org.id, userId: user.id },
    });
    if (!member) {
      await prisma.orgMember.create({
        data: {
          orgId: org.id,
          userId: user.id,
          role: OrgRole.OWNER,
        },
      });
    }
  }

  return { userId: user.id };
}
