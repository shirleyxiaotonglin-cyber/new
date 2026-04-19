import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitToUser } from "@/lib/user-realtime";
import { z } from "zod";

type Ctx = { params: Promise<{ threadId: string }> };

function participantOrThrow(thread: {
  userLowId: string;
  userHighId: string;
}, sessionSub: string) {
  if (thread.userLowId !== sessionSub && thread.userHighId !== sessionSub) {
    return false;
  }
  return true;
}

export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await ctx.params;

  const thread = await prisma.directThread.findUnique({
    where: { id: threadId },
    select: { id: true, userLowId: true, userHighId: true },
  });
  if (!thread || !participantOrThrow(thread, session.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const take = Math.min(Number(new URL(req.url).searchParams.get("take")) || 200, 300);

  const rows = await prisma.directMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take,
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      senderId: m.senderId,
      sender: m.sender,
    })),
  });
}

const PostBody = z.object({
  body: z.string().min(1).max(8000),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await ctx.params;

  const thread = await prisma.directThread.findUnique({
    where: { id: threadId },
    select: { id: true, userLowId: true, userHighId: true },
  });
  if (!thread || !participantOrThrow(thread, session.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const msg = await prisma.directMessage.create({
    data: {
      threadId,
      senderId: session.sub,
      body: parsed.data.body.trim(),
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
    },
  });

  const payload = {
    type: "direct_message",
    threadId,
    message: {
      id: msg.id,
      body: msg.body,
      createdAt: msg.createdAt.toISOString(),
      senderId: msg.senderId,
      sender: msg.sender,
    },
  };

  emitToUser(thread.userLowId, payload);
  emitToUser(thread.userHighId, payload);

  return NextResponse.json({ message: payload.message });
}
