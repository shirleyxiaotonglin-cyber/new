import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { sortedUserPair } from "@/lib/chat-utils";
import { directMessagePeerLabel } from "@/lib/display-user";
import { z } from "zod";

type Ctx = { params: Promise<{ orgId: string }> };

const Body = z.object({
  peerUserId: z.string().min(1),
});

/** 在同一组织内打开 1v1 私聊线程（与项目页 open 等价，便于从消息中心发起） */
export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await ctx.params;
  const self = await requireOrgMember(orgId, session.sub);
  if (!self) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const peerMember = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: peerUserId } },
  });
  if (!peerMember) {
    return NextResponse.json({ error: "对方须为本组织成员" }, { status: 400 });
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

  const peerUser = await prisma.user.findUnique({
    where: { id: peerUserId },
    select: { id: true, username: true, name: true, email: true, avatarUrl: true },
  });

  return NextResponse.json({
    threadId: thread.id,
    peerUserId,
    peer: peerUser
      ? { ...peerUser, name: directMessagePeerLabel(peerUser) }
      : null,
  });
}
