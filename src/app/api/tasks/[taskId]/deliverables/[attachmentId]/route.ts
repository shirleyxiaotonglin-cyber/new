import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canDeleteDeliverable } from "@/lib/access";
import { getDeliverablesBucket, getSupabaseAdmin } from "@/lib/supabase-storage";

type Ctx = { params: Promise<{ taskId: string; attachmentId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId, attachmentId } = await ctx.params;

  const row = await prisma.attachment.findFirst({
    where: { id: attachmentId, taskId },
    include: {
      task: { select: { projectId: true } },
      fileAsset: { select: { id: true, fileKey: true, uploadedById: true } },
    },
  });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireProjectAccess(row.task.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (
    !canDeleteDeliverable(
      access.orgMember.role,
      access.projectMember.role,
      row.fileAsset.uploadedById,
      session.sub,
    )
  ) {
    return NextResponse.json({ error: "无权删除该文件" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const bucket = getDeliverablesBucket();

  if (supabase) {
    const { error } = await supabase.storage.from(bucket).remove([row.fileAsset.fileKey]);
    if (error) {
      return NextResponse.json({ error: `存储删除失败：${error.message}` }, { status: 502 });
    }
  }

  await prisma.$transaction([
    prisma.attachment.delete({ where: { id: attachmentId } }),
    prisma.fileAsset.delete({ where: { id: row.fileAsset.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
