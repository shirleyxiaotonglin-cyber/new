import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sniffImageMime } from "@/lib/image-sniff";

const MAX_BYTES = 900_000;
const MAX_DATA_URL_LEN = 1_200_000;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const runtime = "nodejs";
export const maxDuration = 30;

/** 上传头像：转为 data URL 存入 avatarUrl（适配无对象存储的部署） */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "无法解析上传内容";
    console.error("[avatar] formData:", msg);
    return NextResponse.json(
      { error: "上传数据无效，请缩小图片或稍后重试", detail: process.env.NODE_ENV === "development" ? msg : undefined },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传文件字段 file" }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    console.error("[avatar] arrayBuffer:", e);
    return NextResponse.json({ error: "读取文件失败" }, { status: 400 });
  }

  if (buf.length < 8) {
    return NextResponse.json({ error: "文件过小或已损坏" }, { status: 400 });
  }

  let mime = (file.type || "").trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") {
    const sniffed = sniffImageMime(buf);
    if (sniffed) mime = sniffed;
  }

  if (!ALLOWED.has(mime)) {
    return NextResponse.json(
      {
        error:
          "仅支持 JPEG、PNG、WebP、GIF；若从相册选取，请先导出为 JPG/PNG 再上传。",
      },
      { status: 400 },
    );
  }

  if (buf.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `图片请小于约 ${Math.floor(MAX_BYTES / 1000)}KB，或在前端压缩后再传` },
      { status: 400 },
    );
  }

  const b64 = buf.toString("base64");
  const dataUrl = `data:${mime};base64,${b64}`;
  if (dataUrl.length > MAX_DATA_URL_LEN) {
    return NextResponse.json({ error: "图片编码后过大，请换更小图片或使用自动压缩后重试" }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: session.sub },
      data: { avatarUrl: dataUrl },
    });
  } catch (e) {
    console.error("[avatar] prisma update:", e);
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
    return NextResponse.json(
      {
        error:
          code === "P2002"
            ? "保存冲突，请重试"
            : "保存头像失败，请稍后重试或联系管理员",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ avatarUrl: dataUrl });
}
