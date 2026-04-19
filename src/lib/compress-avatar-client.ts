/**
 * 浏览器端将头像压成较小 JPEG，减轻 data URL 体积与 Vercel/数据库压力。
 * 仅用于客户端组件。
 */
export async function compressAvatarForUpload(file: File, maxEdge = 512): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(maxEdge / bitmap.width, maxEdge / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法创建画布");
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82),
    );
    if (!blob || blob.size < 1) {
      throw new Error("压缩失败");
    }
    const name = file.name.replace(/\.[^.]+$/, "") || "avatar";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
