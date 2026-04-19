import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { emitToUser } from "@/lib/user-realtime";
import { z } from "zod";
import {
  getDeliverablesBucket,
  getSupabaseAdmin,
  signStoragePath,
} from "@/lib/supabase-storage";
import {
  isBlockedMime,
  safeStorageFileName,
} from "@/lib/deliverable-helpers";

type Ctx = { params: Promise<{ threadId: string }> };

const MAX_DM_FILE_BYTES = 30 * 1024 * 1024;

function participantOrThrow(thread: { userLowId: string; userHighId: string }, sessionSub: string) {
  if (thread.userLowId !== sessionSub && thread.userHighId !== sessionSub) {
    return false;
  }
  return true;
}

function peerUserId(thread: { userLowId: string; userHighId: string }, sessionSub: string) {
  return thread.userLowId === sessionSub ? thread.userHighId : thread.userLowId;
}

type MsgRow = {
  id: string;
  body: string;
  createdAt: Date;
  senderId: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  fileAsset: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    fileKey: string;
  } | null;
};

async function toApiMessage(m: MsgRow) {
  const file =
    m.fileAsset ?
      {
        id: m.fileAsset.id,
        name: m.fileAsset.name,
        mimeType: m.fileAsset.mimeType,
        size: m.fileAsset.size,
        url: await signStoragePath(m.fileAsset.fileKey),
      }
    : null;
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    senderId: m.senderId,
    sender: m.sender,
    file,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await ctx.params;

  const thread = await prisma.directThread.findUnique({
    where: { id: threadId },
    select: { id: true, userLowId: true, userHighId: true },
  });
  if (!thread || !participantOrThrow(thread, session.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const take = Math.min(Number(new URL(req.url).searchParams.get("take")) || 200, 300);

  const rows = await prisma.directMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take,
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
      fileAsset: { select: { id: true, name: true, mimeType: true, size: true, fileKey: true } },
    },
  });

  const messages = await Promise.all(rows.map((m) => toApiMessage(m as MsgRow)));

  return NextResponse.json({ messages });
}

const PostBody = z.object({
  body: z.string().min(1).max(8000),
});

export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await ctx.params;

  const thread = await prisma.directThread.findUnique({
    where: { id: threadId },
    select: { id: true, userLowId: true, userHighId: true },
  });
  if (!thread || !participantOrThrow(thread, session.sub)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    return postMultipart(req, thread, threadId, session.sub);
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const msg = await prisma.directMessage.create({
    data: {
      threadId,
      senderId: session.sub,
      body: parsed.data.body.trim(),
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
      fileAsset: { select: { id: true, name: true, mimeType: true, size: true, fileKey: true } },
    },
  });

  const apiMsg = await toApiMessage(msg as MsgRow);
  const payload = {
    type: "direct_message" as const,
    threadId,
    message: apiMsg,
  };

  emitToUser(thread.userLowId, payload);
  emitToUser(thread.userHighId, payload);

  return NextResponse.json({ message: apiMsg });
}

async function postMultipart(
  req: Request,
  thread: { userLowId: string; userHighId: string },
  threadId: string,
  senderId: string,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      {
        error: "私信暂不支持发送附件：文件服务未开通。可先发送文字说明，或联系管理员开通存储。",
      },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const orgIdRaw = form.get("orgId");
  const orgId = typeof orgIdRaw === "string" ? orgIdRaw.trim() : "";
  if (!orgId) {
    return NextResponse.json({ error: "发送文件时需要 orgId" }, { status: 400 });
  }

  const peerId = peerUserId(thread, senderId);
  const [selfOrg, peerOrg] = await Promise.all([
    prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: senderId } },
    }),
    prisma.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: peerId } },
    }),
  ]);
  if (!selfOrg || !peerOrg) {
    return NextResponse.json(
      { error: "双方须同时属于该组织，才能在此组织上下文中传输文件" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "请选择要发送的文件" }, { status: 400 });
  }

  if (file.size > MAX_DM_FILE_BYTES) {
    return NextResponse.json(
      { error: `文件过大（上限 ${Math.round(MAX_DM_FILE_BYTES / 1024 / 1024)}MB）` },
      { status: 400 },
    );
  }

  const mime = file.type || "application/octet-stream";
  if (isBlockedMime(mime)) {
    return NextResponse.json({ error: "不允许发送该类型的文件" }, { status: 400 });
  }

  const captionRaw = form.get("body");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim().length > 0 ?
      captionRaw.trim().slice(0, 8000)
    : "";

  const safeName = safeStorageFileName(file.name || "file");
  const path = `dm/${threadId}/${nanoid()}-${safeName}`;
  const bucket = getDeliverablesBucket();

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, buf, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) {
    return NextResponse.json({ error: `上传失败：${upErr.message}` }, { status: 502 });
  }

  const bodyText =
    caption || `[附件] ${safeName.length > 0 ? safeName : "文件"}`;

  const fileAsset = await prisma.fileAsset.create({
    data: {
      orgId,
      uploadedById: senderId,
      fileKey: path,
      name: safeName,
      mimeType: mime,
      size: file.size,
    },
  });

  const msg = await prisma.directMessage.create({
    data: {
      threadId,
      senderId,
      body: bodyText,
      fileAssetId: fileAsset.id,
    },
    include: {
      sender: { select: { id: true, name: true, avatarUrl: true } },
      fileAsset: { select: { id: true, name: true, mimeType: true, size: true, fileKey: true } },
    },
  });

  const apiMsg = await toApiMessage(msg as MsgRow);
  const payload = {
    type: "direct_message" as const,
    threadId,
    message: apiMsg,
  };

  emitToUser(thread.userLowId, payload);
  emitToUser(thread.userHighId, payload);

  return NextResponse.json({ message: apiMsg });
}
