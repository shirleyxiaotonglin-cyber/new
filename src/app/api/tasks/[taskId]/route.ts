import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canEditTask, effectiveOrgRole } from "@/lib/access";
import { ActivityAction, TaskPriority, TaskStatus } from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { taskDetailInclude } from "@/lib/task-includes";
import { broadcastProjectSync } from "@/lib/project-realtime";
import { findRegisteredUserByEmail, ensureProjectMember } from "@/lib/membership-invite";
import { buildTaskUpdateSummaryLines } from "@/lib/task-update-summary";

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
  /** 协助人用户 ID 列表（须为项目成员，可与 assistantEmails 同时出现并合并） */
  assistantIds: z.array(z.string()).optional(),
  /**
   * 通过已注册邮箱指定负责人；会将其加入本组织与项目，并设置 assigneeId。
   * 传空字符串 "" 表示清空负责人。
   */
  assigneeEmail: z.union([z.string().email(), z.literal("")]).optional(),
  /**
   * 通过邮箱批量指定协作人（须已注册）；解析后与 assistantIds 合并。
   * 传入空数组 [] 表示清空协作人（若未同时传 assistantIds）。
   */
  assistantEmails: z.array(z.string().email()).max(16).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;
  const existing = await prisma.task.findUnique({ where: { id: taskId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireProjectAccess(existing.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canEditTask(effectiveOrgRole(access.orgMember), access.projectMember.role)) {
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

  const projectRow = await prisma.project.findUnique({
    where: { id: existing.projectId },
    select: { orgId: true },
  });
  if (!projectRow) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const membersBefore = await prisma.projectMember.findMany({
    where: { projectId: existing.projectId },
    select: { userId: true },
  });
  const allowedBefore = new Set(membersBefore.map((m) => m.userId));

  let resolvedAssigneeIdFromEmail: string | null | undefined = undefined;
  if (parsed.data.assigneeEmail !== undefined) {
    if (parsed.data.assigneeEmail === "") {
      resolvedAssigneeIdFromEmail = null;
    } else {
      const u = await findRegisteredUserByEmail(parsed.data.assigneeEmail);
      if (!u) {
        return NextResponse.json(
          { error: "未找到该邮箱对应的注册账号，请对方先注册后再指定。" },
          { status: 404 },
        );
      }
      resolvedAssigneeIdFromEmail = u.id;
    }
  }

  let emailAssistantIds: string[] = [];
  if (parsed.data.assistantEmails !== undefined) {
    for (const em of parsed.data.assistantEmails) {
      const u = await findRegisteredUserByEmail(em);
      if (!u) {
        return NextResponse.json(
          { error: `未找到邮箱 ${em} 对应的注册账号，请对方先注册后再指定。` },
          { status: 404 },
        );
      }
      emailAssistantIds.push(u.id);
    }
    emailAssistantIds = Array.from(new Set(emailAssistantIds));
  }

  let patchAssigneeId: string | null | undefined = undefined;
  if (parsed.data.assigneeEmail !== undefined) {
    patchAssigneeId =
      resolvedAssigneeIdFromEmail !== undefined ? resolvedAssigneeIdFromEmail : null;
  } else if (parsed.data.assigneeId !== undefined) {
    if (parsed.data.assigneeId !== null && !allowedBefore.has(parsed.data.assigneeId)) {
      return NextResponse.json(
        {
          error:
            "负责人须从当前项目成员中选择，或通过「邮箱」添加已注册用户。",
        },
        { status: 400 },
      );
    }
    patchAssigneeId = parsed.data.assigneeId;
  }

  const emailAssistSet = new Set(emailAssistantIds);
  if (parsed.data.assistantIds !== undefined) {
    for (const uid of parsed.data.assistantIds) {
      if (!allowedBefore.has(uid) && !emailAssistSet.has(uid)) {
        return NextResponse.json(
          {
            error:
              "协作人须为当前项目成员，或通过邮箱添加已注册用户。",
          },
          { status: 400 },
        );
      }
    }
  }

  let finalAssistantIds: string[] | undefined = undefined;
  if (parsed.data.assistantEmails !== undefined || parsed.data.assistantIds !== undefined) {
    finalAssistantIds = Array.from(
      new Set([
        ...(parsed.data.assistantEmails !== undefined ? emailAssistantIds : []),
        ...(parsed.data.assistantIds ?? []),
      ]),
    );
  }

  const assistantIdsBefore = (
    await prisma.taskAssistant.findMany({
      where: { taskId },
      select: { userId: true },
    })
  ).map((r) => r.userId);

  const updated = await prisma.$transaction(async (tx) => {
    const toEnsure = new Set<string>();
    if (patchAssigneeId) toEnsure.add(patchAssigneeId);
    if (finalAssistantIds) {
      for (const uid of finalAssistantIds) {
        toEnsure.add(uid);
      }
    }

    for (const uid of Array.from(toEnsure)) {
      await ensureProjectMember(tx, {
        projectId: existing.projectId,
        userId: uid,
      });
    }

    await tx.task.update({
      where: { id: taskId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        status: parsed.data.status,
        priority: parsed.data.priority,
        ...(patchAssigneeId !== undefined ? { assigneeId: patchAssigneeId } : {}),
        dueDate,
        startDate,
        sortOrder: parsed.data.sortOrder,
        progress: parsed.data.progress,
      },
    });

    if (finalAssistantIds !== undefined) {
      await tx.taskAssistant.deleteMany({ where: { taskId } });
      if (finalAssistantIds.length > 0) {
        await tx.taskAssistant.createMany({
          data: finalAssistantIds.map((userId) => ({ taskId, userId })),
        });
      }
    }

    const full = await tx.task.findUniqueOrThrow({
      where: { id: taskId },
      include: taskDetailInclude,
    });
    return full;
  });

  const summaryLines = buildTaskUpdateSummaryLines(existing, updated, assistantIdsBefore);
  await prisma.activity.create({
    data: {
      taskId,
      userId: session.sub,
      action: ActivityAction.TASK_UPDATED,
      meta: JSON.stringify({ summaryLines }),
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
  if (!canEditTask(effectiveOrgRole(access.orgMember), access.projectMember.role)) {
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
