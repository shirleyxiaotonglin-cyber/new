import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const orgId = searchParams.get("orgId");
  if (q.length < 2) {
    return NextResponse.json({ tasks: [], projects: [], users: [] });
  }

  const memberships = await prisma.orgMember.findMany({
    where: { userId: session.sub },
    select: { orgId: true },
  });
  const allowedOrgIds = orgId
    ? memberships.some((m) => m.orgId === orgId)
      ? [orgId]
      : []
    : memberships.map((m) => m.orgId);
  if (!allowedOrgIds.length) {
    return NextResponse.json({ tasks: [], projects: [], users: [] });
  }

  const projects = await prisma.project.findMany({
    where: {
      orgId: { in: allowedOrgIds },
      OR: [
        { name: { contains: q } },
        { description: { contains: q } },
      ],
    },
    take: 15,
    select: { id: true, name: true, orgId: true },
  });

  const projectScope = await prisma.project.findMany({
    where: { orgId: { in: allowedOrgIds } },
    select: { id: true },
  });
  const scopedIds = projectScope.map((p) => p.id);

  const tasks = scopedIds.length
    ? await prisma.task.findMany({
        where: {
          projectId: { in: scopedIds },
          OR: [
            { title: { contains: q } },
            { description: { contains: q } },
          ],
        },
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          projectId: true,
        },
      })
    : [];

  const users = await prisma.user.findMany({
    where: {
      OR: [{ name: { contains: q } }, { email: { contains: q } }],
      orgMemberships: { some: { orgId: { in: allowedOrgIds } } },
    },
    take: 10,
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json({ tasks, projects, users });
}
