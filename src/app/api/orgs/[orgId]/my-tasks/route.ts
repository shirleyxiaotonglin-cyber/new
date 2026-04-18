import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/access";

type Ctx = { params: Promise<{ orgId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { orgId } = await ctx.params;
  const m = await requireOrgMember(orgId, session.sub);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: session.sub,
      project: { orgId },
      parentId: null,
    },
    orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      projectId: t.projectId,
      projectName: t.project.name,
    })),
  });
}
