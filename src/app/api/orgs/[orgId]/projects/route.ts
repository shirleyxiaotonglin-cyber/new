import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/access";
import {
  ProjectStatus,
  ProjectTemplate,
  ProjectMemberRole,
  OrgRole,
} from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await ctx.params;
  const m = await requireOrgMember(orgId, session.sub);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const projects = await prisma.project.findMany({
    where: { orgId, status: { not: ProjectStatus.ARCHIVED } },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
    },
  });
  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      template: p.template,
      taskCount: p._count.tasks,
      updatedAt: p.updatedAt,
    })),
  });
}

const CreateBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  template: z
    .enum([
      ProjectTemplate.ENGINEERING,
      ProjectTemplate.MARKETING,
      ProjectTemplate.LOCALIZATION,
      ProjectTemplate.EVENT,
      ProjectTemplate.CUSTOM,
    ])
    .optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await ctx.params;
  const m = await requireOrgMember(orgId, session.sub);
  if (!m || m.role === OrgRole.GUEST) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      template: parsed.data.template ?? ProjectTemplate.CUSTOM,
      status: ProjectStatus.ACTIVE,
      members: {
        create: {
          userId: session.sub,
          role: ProjectMemberRole.OWNER,
        },
      },
    },
  });

  await writeAudit(orgId, session.sub, "project", "create", {
    projectId: project.id,
    name: project.name,
  });

  return NextResponse.json({ project: { id: project.id, name: project.name } });
}
