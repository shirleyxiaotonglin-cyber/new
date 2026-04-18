import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/access";
import { ActivityAction } from "@/lib/constants";
import { broadcastProjectSync } from "@/lib/project-realtime";
import { z } from "zod";

type Ctx = { params: Promise<{ taskId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireProjectAccess(task.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const comments = await prisma.comment.findMany({
    where: { taskId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          mentions: true,
        },
      },
      mentions: true,
    },
  });
  return NextResponse.json({ comments });
}

const Body = z.object({
  body: z.string().min(1),
  parentId: z.string().nullable().optional(),
  mentionUserIds: z.array(z.string()).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const access = await requireProjectAccess(task.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      taskId,
      userId: session.sub,
      body: parsed.data.body,
      parentId: parsed.data.parentId ?? undefined,
      mentions:
        parsed.data.mentionUserIds && parsed.data.mentionUserIds.length
          ? {
              createMany: {
                data: parsed.data.mentionUserIds.map((userId) => ({ userId })),
              },
            }
          : undefined,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.activity.create({
    data: {
      taskId,
      userId: session.sub,
      action: ActivityAction.COMMENT_ADDED,
      meta: JSON.stringify({ commentId: comment.id }),
    },
  });

  /* In-app notifications for @mentions */
  if (parsed.data.mentionUserIds?.length) {
    await prisma.notification.createMany({
      data: parsed.data.mentionUserIds.map((uid) => ({
        userId: uid,
        title: "You were mentioned",
        body: `${access.project.name}: ${parsed.data.body.slice(0, 120)}`,
        channel: "IN_APP",
      })),
    });
  }

  broadcastProjectSync(task.projectId, {
    kind: "comment",
    taskId,
    actorUserId: session.sub,
  });

  return NextResponse.json({ comment });
}
