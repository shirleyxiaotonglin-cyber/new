import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrimaryOrgMembership } from "@/lib/workspace";
import { ProjectMemberRole } from "@/lib/constants";
import { z } from "zod";

const Body = z.object({
  projectId: z.string().min(1),
});

/** 通过项目 ID 加入（不要求事先加入项目所属业务组织） */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const primary = await getPrimaryOrgMembership(session.sub);
  if (!primary) {
    return NextResponse.json({ error: "未找到工作空间" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "需要 projectId" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, orgId: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  await prisma.projectMember.upsert({
    where: {
      projectId_userId: {
        projectId: project.id,
        userId: session.sub,
      },
    },
    create: {
      projectId: project.id,
      userId: session.sub,
      role: ProjectMemberRole.MEMBER,
    },
    update: {},
  });

  return NextResponse.json({
    ok: true,
    projectId: project.id,
    orgId: project.orgId,
    name: project.name,
  });
}
