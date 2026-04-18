import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/access";
import { listProjectPresence, presenceHeartbeat } from "@/lib/project-realtime";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ viewers: listProjectPresence(projectId) });
}

const Body = z.object({
  taskId: z.string().nullable().optional(),
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
    json = {};
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { name: true },
  });
  const name = user?.name?.trim() || "User";
  const taskId =
    parsed.data.taskId === undefined ? null : parsed.data.taskId;

  presenceHeartbeat(projectId, session.sub, name, taskId);

  return NextResponse.json({ ok: true, viewers: listProjectPresence(projectId) });
}
