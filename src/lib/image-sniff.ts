/** 当浏览器未带 type 时，用文件头推断图片 MIME */
export function sniffImageMime(buf: Uint8Array): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 12) {
    const riff = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
    const webp = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "image/gif";
  }
  return null;
}
