import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canUploadDeliverable, effectiveOrgRole } from "@/lib/access";
import {
  MAX_DELIVERABLE_BYTES,
  inferCategoryFromMime,
  isBlockedMime,
  normalizeDeliverableCategory,
  safeStorageFileName,
} from "@/lib/deliverable-helpers";
import { getDeliverablesBucket, getSupabaseAdmin } from "@/lib/supabase-storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ taskId: string }> };

/**
 * 为单个文件签发直传链接（浏览器 PUT 到 Supabase，不经 Vercel 函数体——避免 ~4.5MB 等平台限制）。
 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      {
        error: "文件上传功能尚未开通",
        hint: "请配置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY，并在 Supabase 创建与 SUPABASE_STORAGE_BUCKET 同名的私有存储桶。",
      },
      { status: 503 },
    );
  }

  const { taskId } = await ctx.params;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { select: { id: true, orgId: true } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireProjectAccess(task.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canUploadDeliverable(effectiveOrgRole(access.orgMember), access.projectMember.role)) {
    return NextResponse.json({ error: "无权上传交付物" }, { status: 403 });
  }

  let body: {
    fileName?: string;
    size?: number;
    mimeType?: string;
    category?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const size = typeof body.size === "number" && Number.isFinite(body.size) ? body.size : -1;
  const mimeRaw = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  const mime = mimeRaw || "application/octet-stream";

  if (!fileName) {
    return NextResponse.json({ error: "请提供 fileName" }, { status: 400 });
  }
  if (size < 1 || size > MAX_DELIVERABLE_BYTES) {
    return NextResponse.json(
      {
        error: `单文件大小需在 1 字节～${Math.floor(MAX_DELIVERABLE_BYTES / 1024 / 1024)}MB 之间`,
      },
      { status: 400 },
    );
  }

  if (isBlockedMime(mime)) {
    return NextResponse.json({ error: "不允许的文件类型" }, { status: 400 });
  }

  const category =
    typeof body.category === "string" && body.category.trim().length > 0
      ? normalizeDeliverableCategory(body.category)
      : inferCategoryFromMime(mime);

  const safeName = safeStorageFileName(fileName || "unnamed");
  const path = `${task.project.orgId}/${taskId}/${nanoid()}_${safeName}`;
  const bucket = getDeliverablesBucket();

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);

  if (error || !data?.signedUrl || !data.token) {
    const msg = error?.message ?? "无法创建直传链接";
    return NextResponse.json(
      {
        error: msg.includes("Bucket") || msg.includes("not found")
          ? `存储桶「${bucket}」不可用：请在 Supabase Dashboard → Storage 创建该私有桶并允许 Service Role 上传。`
          : msg,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path,
    /** 完成上传后在 complete 请求中原样传回 */
    meta: {
      category,
      fileName,
      mimeType: mime,
      size: Math.floor(size),
    },
  });
}
