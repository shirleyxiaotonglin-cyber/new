/**
 * 浏览器端将头像压成较小 JPEG，减轻 data URL 体积与 Vercel/数据库压力。
 * 仅用于客户端组件。
 *
 * 优先 createImageBitmap；在 Safari / 部分相册导出图上易失败，则回退到 Image + decode，
 * 避免静默上传未压缩的大图导致服务端拒绝或 generic「上传失败」。
 */
export async function compressAvatarForUpload(file: File, maxEdge = 512): Promise<File> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
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
    const url = URL.createObjectURL(file);
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
  const name = file.name.replace(/\.[^.]+$/, "") || "avatar";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}
