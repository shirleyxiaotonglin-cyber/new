import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/access";
import { getSession } from "@/lib/auth";

type Ctx = { params: Promise<{ orgId: string }> };

/** 当前用户在本组织可见的私信会话列表（对方须为本组织成员）；记录存于 DirectThread / DirectMessage */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await ctx.params;
  const self = await requireOrgMember(orgId, session.sub);
  if (!self) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgUserIds = new Set(
    (
      await prisma.orgMember.findMany({
        where: { orgId },
        select: { userId: true },
      })
    ).map((x) => x.userId),
  );

  const raw = await prisma.directThread.findMany({
    where: {
      OR: [{ userLowId: session.sub }, { userHighId: session.sub }],
    },
    include: {
      userLow: { select: { id: true, name: true, email: true, avatarUrl: true } },
      userHigh: { select: { id: true, name: true, email: true, avatarUrl: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  type Row = {
    threadId: string;
    peer: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
    lastMessage: { body: string; createdAt: string } | null;
    sortTime: number;
  };

  const mapped: Row[] = [];

  for (const th of raw) {
    const peer = th.userLowId === session.sub ? th.userHigh : th.userLow;
    if (!orgUserIds.has(peer.id)) continue;
    const last = th.messages[0];
    mapped.push({
      threadId: th.id,
      peer,
      lastMessage: last
        ? { body: last.body, createdAt: last.createdAt.toISOString() }
        : null,
      sortTime: last ? last.createdAt.getTime() : new Date(th.createdAt).getTime(),
    });
  }

  mapped.sort((a, b) => b.sortTime - a.sortTime);

  return NextResponse.json({
    threads: mapped.map(({ threadId, peer, lastMessage }) => ({
      threadId,
      peer,
      lastMessage,
    })),
  });
}
