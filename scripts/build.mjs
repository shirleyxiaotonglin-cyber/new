/**
 * 生产构建：generate → migrate deploy（除非 SKIP_PRISMA_MIGRATE=1）→ next build
 * Prisma CLI 会从项目根目录加载 .env，无需在此重复判断 DATABASE_URL。
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

try {
  run("npx prisma generate");

  const skipMigrate = process.env.SKIP_PRISMA_MIGRATE === "1";

  if (!skipMigrate) {
    try {
      run("npx prisma migrate deploy");
    } catch {
      console.warn(
        "\n[build] prisma migrate deploy 失败（若无数据库可设置 SKIP_PRISMA_MIGRATE=1 仅编译）。\n",
      );
      process.exit(1);
    }
  } else {
    console.warn("\n[build] 已跳过 prisma migrate deploy（SKIP_PRISMA_MIGRATE=1）。\n");
  }

  run("npx next build");
} catch (e) {
  console.error(e);
  process.exit(1);
}
