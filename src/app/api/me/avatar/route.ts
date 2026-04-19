import { NextResponse } from "next/server";
import type sharp from "sharp";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sniffImageMime } from "@/lib/image-sniff";
import { getDeliverablesBucket, getSupabaseAdmin } from "@/lib/supabase-storage";

/** 编码后写入库的上限（与 PATCH /api/auth/me 中 avatarUrl 校验一致） */
const MAX_DATA_URL_LEN = 1_500_000;
/** 未经过 sharp 时的原始文件上限（Vercel 等对整条请求约 4.5MB，multipart 须留余量） */
const MAX_RAW_BYTES = process.env.VERCEL ? 3_000_000 : 4_000_000;
/** 兼容旧逻辑：sharp 不可用时的裸图上限 */
const MAX_LEGACY_BYTES = 900_000;

const ALLOWED_LEGACY = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const runtime = "nodejs";
export const maxDuration = 30;

function toDataUrl(mime: string, out: Buffer): string {
  const b64 = out.toString("base64");
  return `data:${mime};base64,${b64}`;
}

type SharpFactory = typeof sharp;

/** 运行时动态加载 sharp，避免被打进 webpack 后出现 “Could not load the sharp module” */
async function loadSharp(): Promise<SharpFactory | null> {
  try {
    const mod = await import("sharp");
    return mod.default;
  } catch (e) {
    console.error("[avatar] sharp import failed:", e);
    return null;
  }
}

async function tryNormalizeWithSharp(sharpFn: SharpFactory, input: Buffer): Promise<Buffer | null> {
  const sizes = [384, 512, 420, 360, 280] as const;
  const qualities = [76, 68, 62, 52, 42] as const;

  for (const size of sizes) {
    for (const quality of qualities) {
      try {
        const out = await sharpFn(input, { failOnError: false, animated: false })
          .rotate()
          .resize(size, size, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();

        if (toDataUrl("image/jpeg", out).length <= MAX_DATA_URL_LEN) {
          return out;
        }
      } catch {
        /* 下一组参数 */
      }
    }
  }

  try {
    const out = await sharpFn(input, { failOnError: false, animated: false })
      .rotate()
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 40, mozjpeg: true })
      .toBuffer();
    if (toDataUrl("image/jpeg", out).length <= MAX_DATA_URL_LEN) return out;
  } catch {
    return null;
  }

  return null;
}

function isLikeFile(v: unknown): v is File {
  return (
    typeof v === "object" &&
    v !== null &&
    "arrayBuffer" in v &&
    typeof (v as { arrayBuffer?: unknown }).arrayBuffer === "function"
  );
}

/**
 * 已配置 Supabase 时：服务端写入 `_avatars/{userId}.jpg`（与桶是否 public 无关）。
 * 私有桶时用 **限时签名 URL** 写入 avatarUrl（浏览器 img 可直接加载）；失败则回退 data URL。
 */
async function persistJpegAvatar(userId: string, jpegBuffer: Buffer): Promise<string> {
  const supabase = getSupabaseAdmin();
  const bucket = getDeliverablesBucket();

  if (!supabase) {
    const du = toDataUrl("image/jpeg", jpegBuffer);
    if (du.length > MAX_DATA_URL_LEN) throw new Error("AVATAR_TOO_LARGE");
    return du;
  }

  const path = `_avatars/${userId}.jpg`;
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, jpegBuffer, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (upErr) {
    console.error("[avatar] storage upload:", upErr.message);
    const du = toDataUrl("image/jpeg", jpegBuffer);
    if (du.length > MAX_DATA_URL_LEN) throw new Error("AVATAR_TOO_LARGE");
    return du;
  }

  const { data: binfo } = await supabase.storage.getBucket(bucket);
  if (binfo?.public === true) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (typeof data.publicUrl === "string" && data.publicUrl.startsWith("http")) {
      return data.publicUrl;
    }
  }

  const ttlCandidates = [
    60 * 60 * 24 * 365,
    60 * 60 * 24 * 180,
    60 * 60 * 24 * 30,
    60 * 60 * 24 * 7,
    60 * 60 * 24,
  ];
  for (const sec of ttlCandidates) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, sec);
    if (!error && data?.signedUrl?.startsWith("http")) {
      return data.signedUrl;
    }
  }

  console.error("[avatar] createSignedUrl failed for path", path);

  const du = toDataUrl("image/jpeg", jpegBuffer);
  if (du.length > MAX_DATA_URL_LEN) throw new Error("AVATAR_TOO_LARGE");
  return du;
}

/**
 * 头像上传：sharp 压缩 +（可选）Supabase 对象存储 + 数据库写入 avatarUrl。
 * 成功仅 `{ ok: true }`。
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    const rawFile = form.get("file");
    if (!isLikeFile(rawFile)) {
      return NextResponse.json(
        { error: "请上传文件字段 file（浏览器未识别为文件对象，请换浏览器或重试）" },
        { status: 400 },
      );
    }

    let buf: Buffer;
    try {
      buf = Buffer.from(await rawFile.arrayBuffer());
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

    const sharpFn = await loadSharp();
    const jpegBuf = sharpFn ? await tryNormalizeWithSharp(sharpFn, buf) : null;

    let avatarUrlToSave: string;

    if (jpegBuf) {
      try {
        avatarUrlToSave = await persistJpegAvatar(session.sub, jpegBuf);
      } catch (e) {
        const tag = e instanceof Error ? e.message : "";
        if (tag === "AVATAR_TOO_LARGE") {
          return NextResponse.json(
            {
              error: "头像处理后仍过大，请换一张较小的图片",
            },
            { status: 400 },
          );
        }
        throw e;
      }
    } else {
      let mime = isLikeFile(rawFile) && typeof rawFile.type === "string" ?
          rawFile.type.trim().toLowerCase()
        : "";
      if (!mime || mime === "application/octet-stream") {
        const sniffed = sniffImageMime(buf);
        if (sniffed) mime = sniffed;
      }

      if (!ALLOWED_LEGACY.has(mime)) {
        return NextResponse.json(
          {
            error:
              sharpFn ?
                "无法识别为支持的图片；请使用 JPG/PNG/WebP/GIF，或换用较新浏览器/系统再试（如从相册导出为 JPG）。"
              : "服务端图片引擎不可用：请换 JPG/PNG 小图，或联系管理员检查部署依赖（sharp）。",
          },
          { status: 400 },
        );
      }

      if (buf.length > MAX_LEGACY_BYTES) {
        return NextResponse.json(
          {
            error: `图片请小于约 ${Math.floor(MAX_LEGACY_BYTES / 1000)}KB；服务端无法压缩时请换更小文件。`,
          },
          { status: 400 },
        );
      }

      avatarUrlToSave = toDataUrl(mime, buf);
      if (avatarUrlToSave.length > MAX_DATA_URL_LEN) {
        return NextResponse.json(
          {
            error: "图片编码后过大，请换更小图片后重试",
          },
          { status: 400 },
        );
      }
    }

    try {
      await prisma.user.update({
        where: { id: session.sub },
        data: { avatarUrl: avatarUrlToSave },
      });
    } catch (e) {
      console.error("[avatar] prisma update:", e);
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : "";
      const meta =
        e && typeof e === "object" && "meta" in e ?
          (e as { meta?: { cause?: string } }).meta
        : undefined;
      const msg =
        code === "P2002" ? "保存冲突，请重试"
        : code === "P2022" || code === "P2021" ?
          "数据库结构与当前代码不一致：请在服务端执行 prisma migrate deploy。"
        : meta?.cause?.includes("connect") || code === "P1001" ?
          "无法连接数据库：请检查 DATABASE_URL（部署环境是否已配置 Postgres / Neon，且连接串正确）。"
        : "保存头像失败（数据库写入异常），请稍后重试或联系管理员";
      return NextResponse.json({ error: msg, code: code || undefined }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[avatar] POST uncaught:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error:
          msg.length > 0 && msg.length < 240 ?
            `上传失败：${msg}`
          : "上传失败：服务端处理异常，请换一张 JPG/PNG 小图后再试。",
      },
      { status: 500 },
    );
  }
}
