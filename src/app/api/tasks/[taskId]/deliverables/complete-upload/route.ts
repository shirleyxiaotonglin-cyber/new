import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess, canUploadDeliverable, effectiveOrgRole } from "@/lib/access";
import {
  inferCategoryFromMime,
  isBlockedMime,
  normalizeDeliverableCategory,
} from "@/lib/deliverable-helpers";
import { getDeliverablesBucket, getSupabaseAdmin } from "@/lib/supabase-storage";
import { ActivityAction } from "@/lib/constants";
import { broadcastProjectSync } from "@/lib/project-realtime";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ taskId: string }> };

function pathBelongsToTask(path: string, orgId: string, taskId: string) {
  const prefix = `${orgId}/${taskId}/`;
  return path.startsWith(prefix) && path.length > prefix.length;
}

/**
 * 浏览器直传到 Supabase 成功后，写入 FileAsset + Attachment。
 */
export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "存储未配置" }, { status: 503 });
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
    path?: string;
    fileName?: string;
    mimeType?: string;
    size?: number;
    category?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const path = typeof body.path === "string" ? body.path.trim() : "";
  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  const mime = typeof body.mimeType === "string" ? body.mimeType.trim() : "application/octet-stream";
  const size =
    typeof body.size === "number" && Number.isFinite(body.size) ? Math.floor(body.size) : -1;

  if (!path || !fileName) {
    return NextResponse.json({ error: "请提供 path 与 fileName" }, { status: 400 });
  }

  if (!pathBelongsToTask(path, task.project.orgId, taskId)) {
    return NextResponse.json({ error: "路径无效" }, { status: 400 });
  }

  if (size < 1) {
    return NextResponse.json({ error: "无效的 size" }, { status: 400 });
  }

  if (isBlockedMime(mime)) {
    return NextResponse.json({ error: "不允许的文件类型" }, { status: 400 });
  }

  const cat =
    typeof body.category === "string" && body.category.trim().length > 0
      ? normalizeDeliverableCategory(body.category)
      : inferCategoryFromMime(mime);

  const bucket = getDeliverablesBucket();
  const folder = `${task.project.orgId}/${taskId}`;
  const leaf = path.slice(folder.length + 1);
  if (!leaf || leaf.includes("/")) {
    return NextResponse.json({ error: "路径无效" }, { status: 400 });
  }

  /** 确认对象已落盘（避免仅凭路径写库） */
  const listOnce = () =>
    supabase.storage.from(bucket).list(folder, { limit: 10000 });

  let bins: { name: string }[] | null = null;
  let listErr: { message: string } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 350));
    }
    const r = await listOnce();
    listErr = r.error;
    bins = r.data ?? null;
    if (!listErr && bins?.some((o) => o.name === leaf)) break;
    if (listErr) break;
  }

  if (listErr) {
    console.error("[complete-upload] list:", listErr.message);
    return NextResponse.json(
      { error: "无法在存储中列出文件，请检查桶权限与网络。" },
      { status: 503 },
    );
  }
  const exists = bins?.some((o) => o.name === leaf) ?? false;
  if (!exists) {
    return NextResponse.json(
      { error: "存储中尚未找到该文件；请确认浏览器直传（PUT）已成功，或稍后重试。" },
      { status: 400 },
    );
  }

  const priorAtt = await prisma.attachment.findFirst({
    where: { taskId, fileAsset: { fileKey: path } },
    include: { fileAsset: true },
  });
  if (priorAtt) {
    return NextResponse.json({
      ok: true,
      id: priorAtt.id,
      fileName: priorAtt.fileAsset.name,
      category: priorAtt.category ?? inferCategoryFromMime(priorAtt.fileAsset.mimeType),
      size: priorAtt.fileAsset.size,
      fileType: priorAtt.fileAsset.mimeType,
      duplicate: true,
    });
  }

  try {
    const fileAsset = await prisma.fileAsset.create({
      data: {
        orgId: task.project.orgId,
        uploadedById: session.sub,
        fileKey: path,
        name: fileName,
        mimeType: mime,
        size,
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

    await prisma.activity.create({
      data: {
        taskId,
        userId: session.sub,
        action: ActivityAction.FILE_UPLOADED,
        meta: JSON.stringify({ summaryLines: [`上传了交付物「${fileName}」`] }),
      },
    });
    broadcastProjectSync(task.projectId, {
      kind: "deliverable",
      taskId,
      actorUserId: session.sub,
    });

    return NextResponse.json({
      ok: true,
      id: att.id,
      fileName: fileAsset.name,
      category: cat,
      size: fileAsset.size,
      fileType: fileAsset.mimeType,
    });
  } catch (e) {
    console.error("[complete-upload] prisma:", e);
    await supabase.storage.from(bucket).remove([path]).catch(() => {});
    return NextResponse.json(
      { error: "保存记录失败（可能是数据库未迁移或连接异常）" },
      { status: 500 },
    );
  }
}
