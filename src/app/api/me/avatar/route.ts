import { NextResponse } from "next/server";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sniffImageMime } from "@/lib/image-sniff";

/** 编码后写入库的上限（Postgres TEXT + 响应体积） */
const MAX_DATA_URL_LEN = 1_200_000;
/** 未经过 sharp 时的原始文件上限（与 Vercel 单次请求上限留余量） */
const MAX_RAW_BYTES = 4_000_000;
/** 兼容旧逻辑：sharp 不可用时的裸图上限 */
const MAX_LEGACY_BYTES = 900_000;

const ALLOWED_LEGACY = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * 使用 sharp 统一转为 JPEG 并缩放，兼容相册大图、HEIC（运行环境支持时）、无 MIME 等情况。
 * 若 sharp 失败则回退到「仅校验类型与体积」的旧路径。
 */
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
      {
        error: "上传数据无效，请缩小图片或稍后重试",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
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

  if (buf.length > MAX_RAW_BYTES) {
    return NextResponse.json(
      {
        error: `图片过大（超过约 ${Math.floor(MAX_RAW_BYTES / 1_000_000)}MB），请先压缩后再传`,
      },
      { status: 400 },
    );
  }

  const sharpResult = await tryNormalizeWithSharp(buf);
  let dataUrl: string;
  let usedSharp = false;

  if (sharpResult) {
    dataUrl = toDataUrl(sharpResult.mime, sharpResult.buf);
    usedSharp = true;
  } else {
    let mime = (file.type || "").trim().toLowerCase();
    if (!mime || mime === "application/octet-stream") {
      const sniffed = sniffImageMime(buf);
      if (sniffed) mime = sniffed;
    }

    if (!ALLOWED_LEGACY.has(mime)) {
      return NextResponse.json(
        {
          error:
            "无法识别为支持的图片；请使用 JPG/PNG/WebP/GIF，或换用较新浏览器/系统再试（如从相册导出为 JPG）。",
        },
        { status: 400 },
      );
    }

    if (buf.length > MAX_LEGACY_BYTES) {
      return NextResponse.json(
        {
          error: `图片请小于约 ${Math.floor(MAX_LEGACY_BYTES / 1000)}KB；若已选较小文件仍失败，请联系管理员检查服务端依赖。`,
        },
        { status: 400 },
      );
    }

    dataUrl = toDataUrl(mime, buf);
  }

  if (dataUrl.length > MAX_DATA_URL_LEN) {
    return NextResponse.json(
      {
        error: usedSharp
          ? "头像处理后仍过大，请换一张较小的图片"
          : "图片编码后过大，请换更小图片后重试",
      },
      { status: 400 },
    );
  }

  try {
    await prisma.user.update({
      where: { id: session.sub },
      data: { avatarUrl: dataUrl },
    });
  } catch (e) {
    console.error("[avatar] prisma update:", e);
    const code =
      e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
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

function toDataUrl(mime: string, out: Buffer): string {
  const b64 = out.toString("base64");
  return `data:${mime};base64,${b64}`;
}

async function tryNormalizeWithSharp(
  input: Buffer,
): Promise<{ buf: Buffer; mime: string } | null> {
  const sizes = [512, 420, 360] as const;
  const qualities = [82, 72, 62, 52] as const;

  for (const size of sizes) {
    for (const quality of qualities) {
      try {
        const out = await sharp(input, { failOnError: false, animated: false })
          .rotate()
          .resize(size, size, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();

        const url = toDataUrl("image/jpeg", out);
        if (url.length <= MAX_DATA_URL_LEN) {
          return { buf: out, mime: "image/jpeg" };
        }
      } catch {
        /* 下一组参数 */
      }
    }
  }

  try {
    const out = await sharp(input, { failOnError: false, animated: false })
      .rotate()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 48, mozjpeg: true })
      .toBuffer();
    const url = toDataUrl("image/jpeg", out);
    if (url.length <= MAX_DATA_URL_LEN) {
      return { buf: out, mime: "image/jpeg" };
    }
  } catch {
    return null;
  }

  return null;
}
