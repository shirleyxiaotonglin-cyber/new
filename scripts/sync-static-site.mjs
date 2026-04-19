/**
 * 将 static-site/index.html 同步到 public/site/index.html，
 * 保证 Vercel / Next 托管的「线上官网」与纯静态目录一致。
 * 不覆盖 public/site/login.html（该文件含 Next 同域下的 /login 跳转逻辑）。
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "static-site/index.html");
const dest = join(root, "public/site/index.html");

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("[sync-static-site] static-site/index.html → public/site/index.html");
