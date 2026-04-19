import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { broadcastTaskChat } from "@/lib/project-realtime";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ taskId: string }> };

async function requireTaskChatAccess(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { projectId: true },
  });
  if (!task) return null;
  const access = await requireProjectAccess(task.projectId, userId);
  if (!access) return null;
  return { projectId: task.projectId, access };
}

export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const gate = await requireTaskChatAccess(taskId, session.sub);
  if (!gate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const take = Math.min(Number(new URL(req.url).searchParams.get("take")) || 200, 300);

  const rows = await prisma.taskChatMessage.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    take,
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(
    {
      messages: rows.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        senderId: m.senderId,
        sender: m.sender,
      })),
    },
    {
      headers: {
        "Cache-Control": "private, no-store, must-revalidate",
      },
    },
  );
}

const PostBody = z.object({
  body: z.string().min(1).max(8000),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await ctx.params;
  const gate = await requireTaskChatAccess(taskId, session.sub);
  if (!gate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const msg = await prisma.taskChatMessage.create({
    data: {
      taskId,
      senderId: session.sub,
      body: parsed.data.body.trim(),
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const message = {
    id: msg.id,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    senderId: msg.senderId,
    sender: msg.sender,
  };

  broadcastTaskChat(gate.projectId, taskId, message);

  return NextResponse.json({ message });
}
