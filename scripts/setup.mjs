/**
 * 一键初始化：.env → prisma generate → migrate deploy → seed（SQLite）
 */
import { execSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

function run(cmd, label) {
  console.info(`\n▸ ${label}…`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

try {
  if (!existsSync(examplePath)) {
    console.error("缺少 .env.example");
    process.exit(1);
  }
  if (!existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    console.info("✓ 已创建 .env（来自 .env.example）");
  }

  run("npx prisma generate", "prisma generate");
  run("npx prisma migrate deploy", "应用数据库迁移（SQLite）");

  try {
    run("npx tsx prisma/seed.ts", "写入演示账号与项目");
  } catch {
    console.warn("⚠ 种子未执行完成（若已有数据可忽略）");
  }

  console.info("\n✅ 完成。下一步：npm run dev\n   访问 http://localhost:3000 使用演示账号登录。\n");
} catch (e) {
  console.error(e);
  process.exit(1);
}
