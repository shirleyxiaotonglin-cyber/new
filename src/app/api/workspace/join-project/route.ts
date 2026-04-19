import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPrimaryOrgMembership } from "@/lib/workspace";
import { ProjectMemberRole } from "@/lib/constants";
import { z } from "zod";
import { normalizeProjectIdInput } from "@/lib/project-id-input";

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

  const normalizedId = normalizeProjectIdInput(parsed.data.projectId);
  if (!normalizedId || normalizedId.length < 8) {
    return NextResponse.json(
      { error: "项目 ID 无效，请粘贴完整 ID 或浏览器地址栏中的项目页链接。" },
      { status: 400 },
    );
  }

  let project = await prisma.project.findUnique({
    where: { id: normalizedId },
    select: { id: true, orgId: true, name: true },
  });

  // 任务 ID 与项目 ID 同为 cuid，用户易把任务链接里的 ID 当成项目 ID
  if (!project) {
    const asTask = await prisma.task.findUnique({
      where: { id: normalizedId },
      select: { projectId: true },
    });
    if (asTask) {
      project = await prisma.project.findUnique({
        where: { id: asTask.projectId },
        select: { id: true, orgId: true, name: true },
      });
    }
  }

  if (!project) {
    return NextResponse.json(
      {
        error:
          "未找到该项目。请核对是否为「项目」ID（浏览器地址栏 …/project/ 后的一段）；若粘贴的是任务详情里的 ID，也可保留——系统已尝试按任务归入项目。仍失败时请确认与对方使用同一站点（同一数据库），并与负责人核对 ID。",
      },
      { status: 404 },
    );
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
