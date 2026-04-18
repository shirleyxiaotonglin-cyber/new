import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canEditTask } from "@/lib/access";
import { ActivityAction, TaskPriority, TaskStatus } from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { taskDetailInclude } from "@/lib/task-includes";
import { broadcastProjectSync } from "@/lib/project-realtime";

type Ctx = { params: Promise<{ taskId: string }> };

const PatchBody = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z
    .enum([TaskStatus.TODO, TaskStatus.DOING, TaskStatus.DONE, TaskStatus.BLOCKED])
    .optional(),
  priority: z
    .enum([TaskPriority.P0, TaskPriority.P1, TaskPriority.P2, TaskPriority.P3])
    .optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
  progress: z.number().min(0).max(100).optional(),
  /** 协助人用户 ID 列表（须为项目成员） */
  assistantIds: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireProjectAccess(existing.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canEditTask(access.orgMember.role, access.projectMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const dueDate =
    parsed.data.dueDate === undefined
      ? undefined
      : parsed.data.dueDate
        ? new Date(parsed.data.dueDate)
        : null;
  const startDate =
    parsed.data.startDate === undefined
      ? undefined
      : parsed.data.startDate
        ? new Date(parsed.data.startDate)
        : null;

  if (parsed.data.assistantIds !== undefined) {
    const members = await prisma.projectMember.findMany({
      where: { projectId: existing.projectId },
      select: { userId: true },
    });
    const allowed = new Set(members.map((m) => m.userId));
    for (const uid of parsed.data.assistantIds) {
      if (!allowed.has(uid)) {
        return NextResponse.json(
          { error: "协助人须为当前项目成员" },
          { status: 400 },
        );
      }
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        priority: parsed.data.priority,
        assigneeId: parsed.data.assigneeId,
        dueDate,
        startDate,
        sortOrder: parsed.data.sortOrder,
        progress: parsed.data.progress,
      },
    });

    if (parsed.data.assistantIds !== undefined) {
      await tx.taskAssistant.deleteMany({ where: { taskId } });
      if (parsed.data.assistantIds.length > 0) {
        await tx.taskAssistant.createMany({
          data: parsed.data.assistantIds.map((userId) => ({ taskId, userId })),
        });
      }
    }

    const full = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      include: taskDetailInclude,
    });
    return full;
  });

  const meta: Record<string, unknown> = { before: existing, after: updated };
  await prisma.activity.create({
    data: {
      taskId,
      userId: session.sub,
      action: ActivityAction.TASK_UPDATED,
      meta: JSON.stringify(meta),
    },
  });
  await writeAudit(access.project.orgId, session.sub, "task", "update", { taskId });

  broadcastProjectSync(existing.projectId, {
    kind: "task",
    taskId,
    actorUserId: session.sub,
  });

  return NextResponse.json({ task: updated });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireProjectAccess(existing.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canEditTask(access.orgMember.role, access.projectMember.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pid = existing.projectId;
  await prisma.task.delete({ where: { id: taskId } });
  await writeAudit(access.project.orgId, session.sub, "task", "delete", { taskId });
  broadcastProjectSync(pid, {
    kind: "task",
    taskId,
    actorUserId: session.sub,
  });
  return NextResponse.json({ ok: true });
}
