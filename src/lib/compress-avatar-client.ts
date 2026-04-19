/**
 * 浏览器端将头像压成较小 JPEG，减轻 data URL 体积与 Vercel/数据库压力。
 * 仅用于客户端组件。
 *
 * iPhone 相册 HEIC：先用 heic2any 转为 JPEG，再走画布压缩（canvas 无法直接解码 HEIC）。
 *
 * 优先 createImageBitmap；在 Safari / 部分图上易失败，则回退到 Image + decode，
 * 避免静默上传未压缩的大图导致服务端拒绝或 generic「上传失败」。
 */
function isHeicLike(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

async function heicLikeToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.88,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  if (!blob || blob.size < 1) {
    throw new Error("HEIC 转换结果为空");
  }
  const base = file.name.replace(/\.[^.]+$/i, "") || "avatar";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

export async function compressAvatarForUpload(file: File, maxEdge = 512): Promise<File> {
  let source = file;
  if (isHeicLike(file)) {
    source = await heicLikeToJpeg(file);
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    bitmap = null;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布");
  }

  if (bitmap) {
    try {
      const scale = Math.min(maxEdge / bitmap.width, maxEdge / bitmap.height, 1);
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(bitmap, 0, 0, w, h);
    } finally {
      bitmap.close();
    }
  } else {
    const url = URL.createObjectURL(source);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      if (!nw || !nh) {
        throw new Error("无法读取图片尺寸");
      }
      const scale = Math.min(maxEdge / nw, maxEdge / nh, 1);
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
  );
  if (!blob || blob.size < 1) {
    throw new Error("压缩失败");
  }
  const name = source.name.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}
