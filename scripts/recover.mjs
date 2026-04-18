/**
 * 站点打不开 / Chunk 缺失 / 编译缓存异常时：清 .next、重新生成 Prisma、应用迁移。
 * 用法：在项目根目录执行  npm run recover  然后  npm run dev
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, label) {
  console.info(`\n▸ ${label}…`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

try {
  const nextDir = join(root, ".next");
  if (existsSync(nextDir)) {
    console.info("\n▸ 删除 .next（Next 编译缓存）…");
    rmSync(nextDir, { recursive: true, force: true });
  } else {
    console.info("\n▸ 无 .next 目录，跳过删除");
  }

  run("npx prisma generate", "prisma generate");

  try {
    run("npx prisma migrate deploy", "应用数据库迁移");
  } catch {
    console.warn(
      "\n⚠ migrate deploy 失败。若仅需恢复前端缓存可忽略；数据库错误请执行: npm run setup\n",
    );
  }

  console.info(`
✅ recover 完成。

下一步：
  npm run dev

若终端提示端口不是 3000，请使用打印出的 http://localhost:端口 访问（Cookie 按端口区分）。
若页面仍异常，浏览器强制刷新（⌘⇧R）或清空本站缓存后再试。
`);
} catch (e) {
  console.error("\n❌ recover 失败:", e);
  process.exit(1);
}
