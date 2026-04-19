import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/access";
import { inferCategoryFromMime } from "@/lib/deliverable-helpers";
import { getDeliverablesBucket, getSupabaseAdmin } from "@/lib/supabase-storage";

type Ctx = { params: Promise<{ projectId: string }> };

async function signUrl(fileKey: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const bucket = getDeliverablesBucket();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(fileKey, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** 项目资源库：汇总本项目所有任务的交付物，支持筛选 */
export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const uploaderId = searchParams.get("uploaderId") ?? undefined;

  const rows = await prisma.attachment.findMany({
    where: {
      task: { projectId },
      ...(taskId ? { taskId } : {}),
      ...(category ? { category } : {}),
      ...(uploaderId ? { fileAsset: { uploadedById: uploaderId } } : {}),
    },
    include: {
      task: { select: { id: true, title: true } },
      fileAsset: {
        include: {
          uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
    },
  });

  const sorted = [...rows].sort(
    (a, b) => b.fileAsset.createdAt.getTime() - a.fileAsset.createdAt.getTime(),
  );

  const items = await Promise.all(
    sorted.map(async (r) => ({
      id: r.id,
      taskId: r.taskId,
      taskTitle: r.task.title,
      category: r.category ?? inferCategoryFromMime(r.fileAsset.mimeType),
      fileName: r.fileAsset.name,
      fileType: r.fileAsset.mimeType,
      size: r.fileAsset.size,
      version: r.fileAsset.version,
      createdAt: r.fileAsset.createdAt.toISOString(),
      uploader: r.fileAsset.uploadedBy,
      url: await signUrl(r.fileAsset.fileKey),
    })),
  );

  return NextResponse.json({
    items,
    storageConfigured: getSupabaseAdmin() !== null,
    projectId,
  });
}
