import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 350_000;
const MAX_DATA_URL_LEN = 500_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** 上传头像：转为 data URL 存入 avatarUrl（适配无对象存储的部署） */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传文件字段 file" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) {
    return NextResponse.json({ error: "仅支持 JPEG、PNG、WebP、GIF" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: `图片请小于 ${Math.floor(MAX_BYTES / 1000)}KB` }, { status: 400 });
  }

  const b64 = buf.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;
  if (dataUrl.length > MAX_DATA_URL_LEN) {
    return NextResponse.json({ error: "图片过大，请压缩后重试" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.sub },
    data: { avatarUrl: dataUrl },
  });

  return NextResponse.json({ avatarUrl: dataUrl });
}
