import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { sortedUserPair } from "@/lib/chat-utils";
import { z } from "zod";

type Ctx = { params: Promise<{ projectId: string }> };

const Body = z.object({
  peerUserId: z.string().min(1),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
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

  const peerUserId = parsed.data.peerUserId;
  if (peerUserId === session.sub) {
    return NextResponse.json({ error: "不能与自己发起会话" }, { status: 400 });
  }

  const peerMember = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: peerUserId } },
  });
  if (!peerMember) {
    return NextResponse.json({ error: "对方须为本项目成员" }, { status: 400 });
  }

  const [low, high] = sortedUserPair(session.sub, peerUserId);

  const thread = await prisma.directThread.upsert({
    where: {
      userLowId_userHighId: { userLowId: low, userHighId: high },
    },
    create: { userLowId: low, userHighId: high },
    update: {},
    select: { id: true },
  });

  return NextResponse.json({ threadId: thread.id, peerUserId });
}
