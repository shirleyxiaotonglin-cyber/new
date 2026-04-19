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

type Ctx = { params: Promise<{ taskId: string }> };

async function signUrl(fileKey: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const bucket = getDeliverablesBucket();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(fileKey, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** 列出任务交付物（含限时签名下载/预览 URL） */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { taskId } = await ctx.params;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireProjectAccess(task.projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.attachment.findMany({
    where: { taskId },
    include: {
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

  const storageOk = getSupabaseAdmin() !== null;
  const items = await Promise.all(
    sorted.map(async (r) => ({
      id: r.id,
      taskId: r.taskId,
      category: r.category ?? inferCategoryFromMime(r.fileAsset.mimeType),
      fileName: r.fileAsset.name,
      fileType: r.fileAsset.mimeType,
      size: r.fileAsset.size,
      version: r.fileAsset.version,
      createdAt: r.fileAsset.createdAt.toISOString(),
      uploader: r.fileAsset.uploadedBy,
      url: storageOk ? await signUrl(r.fileAsset.fileKey) : null,
    })),
  );

  return NextResponse.json({
    items,
    storageConfigured: storageOk,
  });
}

/** 上传一个或多个交付物（multipart field `file`，可选 `category` 每个文件前单独传复杂 —— 简化：同一 category 应用于本请求所有文件，另支持 `category` 表单字段） */
export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      {
        error: "文件上传功能尚未开通",
        hint: "请联系管理员配置文件存储；开通前您仍可编辑任务说明并在线下传递文件。",
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const categoryRaw = formData.get("category");

  const files = formData
    .getAll("file")
    .filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x);

  if (files.length === 0) {
    return NextResponse.json({ error: "请选择文件（字段名 file）" }, { status: 400 });
  }

  const bucket = getDeliverablesBucket();
  const uploaded: {
    id: string;
    fileName: string;
    category: string;
    size: number;
    fileType: string;
  }[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const mime = file.type || "application/octet-stream";
    if (isBlockedMime(mime)) {
      errors.push(`${file.name}：不允许的文件类型`);
      continue;
    }
    if (file.size > MAX_DELIVERABLE_BYTES) {
      errors.push(`${file.name}：超过大小上限（${Math.floor(MAX_DELIVERABLE_BYTES / 1024 / 1024)}MB）`);
      continue;
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const cat =
      typeof categoryRaw === "string" && categoryRaw.trim().length > 0
        ? normalizeDeliverableCategory(categoryRaw)
        : inferCategoryFromMime(mime);
    const safeName = safeStorageFileName(file.name || "unnamed");
    const path = `${task.project.orgId}/${taskId}/${nanoid()}_${safeName}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, buf, {
      contentType: mime,
      upsert: false,
    });

    if (upErr) {
      errors.push(`${file.name}：存储失败 ${upErr.message}`);
      continue;
    }

    try {
      const fileAsset = await prisma.fileAsset.create({
        data: {
          orgId: task.project.orgId,
          uploadedById: session.sub,
          fileKey: path,
          name: file.name || safeName,
          mimeType: mime,
          size: file.size,
          version: 1,
        },
      });

      const att = await prisma.attachment.create({
        data: {
          taskId,
          fileAssetId: fileAsset.id,
          category: cat,
        },
      });

      uploaded.push({
        id: att.id,
        fileName: fileAsset.name,
        category: cat,
        size: fileAsset.size,
        fileType: fileAsset.mimeType,
      });
    } catch {
      await supabase.storage.from(bucket).remove([path]).catch(() => {});
      errors.push(`${file.name}：数据库写入失败`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0 || uploaded.length > 0,
    uploaded,
    errors: errors.length ? errors : undefined,
  });
}
