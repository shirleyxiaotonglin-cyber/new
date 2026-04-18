import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/access";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: { id: true },
  });
  const ids = tasks.map((t) => t.id);
  const rows = await prisma.activity.findMany({
    where: { taskId: { in: ids } },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      user: { select: { id: true, name: true, email: true } },
      task: { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({ activities: rows });
}
