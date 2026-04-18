import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/access";
import { ProjectMemberRole } from "@/lib/constants";
import { z } from "zod";

type Ctx = { params: Promise<{ orgId: string }> };

const Body = z.object({
  projectId: z.string().min(1),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await ctx.params;
  const m = await requireOrgMember(orgId, session.sub);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, orgId },
  });
  if (!project) {
    return NextResponse.json({ error: "项目不存在或不属于本组织" }, { status: 404 });
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

  return NextResponse.json({ ok: true, projectId: project.id, name: project.name });
}
