import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/access";
import { TaskStatus } from "@/lib/constants";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tasks = await prisma.task.findMany({
    where: { projectId, parentId: null },
    select: {
      status: true,
      assigneeId: true,
      dueDate: true,
      priority: true,
    },
  });

  const now = new Date();
  let overdue = 0;
  const byStatus: Record<string, number> = {};
  const byAssignee: Record<string, number> = {};

  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.assigneeId) {
      byAssignee[t.assigneeId] = (byAssignee[t.assigneeId] ?? 0) + 1;
    }
    if (t.dueDate && t.dueDate < now && t.status !== TaskStatus.DONE) {
      overdue += 1;
    }
  }

  const done = byStatus[TaskStatus.DONE] ?? 0;
  const total = tasks.length;
  const completionRate = total ? Math.round((done / total) * 100) : 0;

  return NextResponse.json({
    summary: {
      total,
      completionRate,
      overdueCount: overdue,
      byStatus,
    },
    workload: byAssignee,
  });
}
