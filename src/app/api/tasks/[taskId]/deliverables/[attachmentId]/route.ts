import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canDeleteDeliverable, effectiveOrgRole } from "@/lib/access";
import { getDeliverablesBucket, getSupabaseAdmin } from "@/lib/supabase-storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ taskId: string; attachmentId: string }> };

function contentDispositionAttachment(filename: string): string {
  const trimmed = filename.trim() || "download";
  const asciiFallback = trimmed.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}

/** 经服务端从 Storage 拉取并附带 Content-Disposition: attachment，触发浏览器下载（避免直链仅在新标签打开） */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId, attachmentId } = await ctx.params;

  const row = await prisma.attachment.findFirst({
    where: { id: attachmentId, taskId },
    include: {
      task: { select: { projectId: true } },
      fileAsset: { select: { fileKey: true, name: true, mimeType: true } },
    },
  });

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireProjectAccess(row.task.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "存储未配置" }, { status: 503 });
  }

  const bucket = getDeliverablesBucket();
  const { data: blob, error } = await supabase.storage.from(bucket).download(row.fileAsset.fileKey);
  if (error || !blob) {
    return NextResponse.json(
      { error: `读取文件失败：${error?.message ?? "unknown"}` },
      { status: 502 },
    );
  }

  const filename = row.fileAsset.name || "download";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": row.fileAsset.mimeType || "application/octet-stream",
      "Content-Disposition": contentDispositionAttachment(filename),
      "Cache-Control": "private, no-store",
    },
  });
}

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
      effectiveOrgRole(access.orgMember),
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
