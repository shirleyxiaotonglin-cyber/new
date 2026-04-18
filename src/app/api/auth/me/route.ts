import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, email: true, name: true, avatarUrl: true },
  });
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const orgs = await prisma.orgMember.findMany({
    where: { userId: user.id },
    include: { org: { select: { id: true, name: true, slug: true } } },
  });
  return NextResponse.json({
    user,
    organizations: orgs.map((o) => ({
      ...o.org,
      role: o.role,
    })),
  });
}
