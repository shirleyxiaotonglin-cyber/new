import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canDeleteProject, requireProjectAccess } from "@/lib/access";
import { ProjectStatus } from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { broadcastProjectSync } from "@/lib/project-realtime";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      tags: true,
    },
  });
  return NextResponse.json({ project });
}

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum([ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED]).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const before = await prisma.project.findUnique({ where: { id: projectId } });
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...parsed.data,
      archivedAt:
        parsed.data.status === ProjectStatus.ARCHIVED
          ? new Date()
          : parsed.data.status === ProjectStatus.ACTIVE
            ? null
            : undefined,
    },
  });
  await writeAudit(access.project.orgId, session.sub, "project", "update", {
    projectId,
    before,
    after: updated,
  });
  broadcastProjectSync(projectId, {
    kind: "project",
    actorUserId: session.sub,
  });
  return NextResponse.json({ project: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (
    !canDeleteProject(access.orgMember.role, access.projectMember.role)
  ) {
    return NextResponse.json(
      { error: "仅组织管理员或项目负责人/项目管理员可删除项目" },
      { status: 403 },
    );
  }

  const orgId = access.project.orgId;
  await prisma.project.delete({ where: { id: projectId } });
  await writeAudit(orgId, session.sub, "project", "delete", { projectId });
  return NextResponse.json({ ok: true });
}
