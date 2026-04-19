import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canEditTask } from "@/lib/access";
import { ActivityAction, TaskPriority, TaskStatus } from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { taskDetailInclude } from "@/lib/task-includes";
import { broadcastProjectSync } from "@/lib/project-realtime";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const assignee = searchParams.get("assignee");
  const q = searchParams.get("q");

  const tasks = await prisma.task.findMany({
    where: {
      projectId,
      parentId: null,
      ...(status ? { status } : {}),
      ...(assignee ? { assigneeId: assignee } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: taskDetailInclude,
  });

  return NextResponse.json({ tasks });
}

const CreateBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z
    .enum([TaskStatus.TODO, TaskStatus.DOING, TaskStatus.DONE, TaskStatus.BLOCKED])
    .optional(),
  priority: z
    .enum([TaskPriority.P0, TaskPriority.P1, TaskPriority.P2, TaskPriority.P3])
    .optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  progress: z.number().min(0).max(100).optional(),
  parentId: z.string().nullable().optional(),
  predecessorIds: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
  /** 协助人（须为项目成员）；可与 PATCH 任务接口一致 */
  assistantIds: z.array(z.string()).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
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
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const memberRows = await prisma.projectMember.findMany({
    where: { projectId },
    select: { userId: true },
  });
  const memberSet = new Set(memberRows.map((m) => m.userId));
  if (parsed.data.assigneeId && !memberSet.has(parsed.data.assigneeId)) {
    return NextResponse.json({ error: "负责人须为当前项目成员" }, { status: 400 });
  }
  const assistantIdsRaw = parsed.data.assistantIds ?? [];
  const assistantIds = assistantIdsRaw.filter((id) => id !== parsed.data.assigneeId);
  for (const uid of assistantIds) {
    if (!memberSet.has(uid)) {
      return NextResponse.json({ error: "协助人须为当前项目成员" }, { status: 400 });
    }
  }

  const maxOrder = await prisma.task.aggregate({
    where: { projectId },
    _max: { sortOrder: true },
  });

  const assistantUnique = Array.from(new Set(assistantIds));

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status ?? TaskStatus.TODO,
      priority: parsed.data.priority ?? TaskPriority.P2,
      project: { connect: { id: projectId } },
      ...(parsed.data.assigneeId ? { assignee: { connect: { id: parsed.data.assigneeId } } } : {}),
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      ...(typeof parsed.data.progress === "number" ? { progress: parsed.data.progress } : {}),
      ...(parsed.data.parentId ? { parent: { connect: { id: parsed.data.parentId } } } : {}),
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      tags:
        parsed.data.tagIds && parsed.data.tagIds.length
          ? {
              create: parsed.data.tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : undefined,
      dependenciesSuccessors:
        parsed.data.predecessorIds && parsed.data.predecessorIds.length
          ? {
              create: parsed.data.predecessorIds.map((predecessorId) => ({
                predecessor: { connect: { id: predecessorId } },
              })),
            }
          : undefined,
      assistants:
        assistantUnique.length > 0
          ? {
              create: assistantUnique.map((userId) => ({
                user: { connect: { id: userId } },
              })),
            }
          : undefined,
      activities: {
        create: {
          action: ActivityAction.TASK_CREATED,
          meta: JSON.stringify({ title: parsed.data.title }),
          user: { connect: { id: session.sub } },
        },
      },
    },
    include: taskDetailInclude,
  });

  await writeAudit(access.project.orgId, session.sub, "task", "create", {
    taskId: task.id,
  });

  broadcastProjectSync(projectId, {
    kind: "task",
    taskId: task.id,
    actorUserId: session.sub,
  });

  return NextResponse.json({ task });
}
