/**
 * 启动 dev 前尽量保证：有 .env、Prisma Client 与 DB 结构与 schema 一致。
 * 若环境已就绪可跳过：SKIP_ENSURE_DEV=1 npm run dev
 * 若 migrate 长期失败：SKIP_MIGRATE_ON_DEV=1 npm run dev（然后手动 npm run setup）
 *
 * 全程同步执行，避免异步 IIFE 导致进程提前退出、predev 未跑完就启动 next。
 */
import { execSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.SKIP_ENSURE_DEV === "1") {
  console.info("[ensure-dev] 已跳过（SKIP_ENSURE_DEV=1）\n");
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const examplePath = join(root, ".env.example");

function exec(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

function sleepMs(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isTransientDbLock(err) {
  const msg = String(err?.message ?? err ?? "");
  return (
    msg.includes("SQLITE_BUSY") ||
    msg.includes("database is locked") ||
    msg.includes("Unable to open the database") ||
    msg.includes("EBUSY") ||
    msg.includes("resource temporarily unavailable")
  );
}

function execWithRetries(cmd, label, attempts = 8, baseDelayMs = 200) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      exec(cmd);
      return;
    } catch (e) {
      lastErr = e;
      const transient = isTransientDbLock(e);
      if (i === attempts || !transient) {
        throw e;
      }
      const wait = baseDelayMs * i;
      console.warn(
        `[ensure-dev] ${label} 暂时失败（多为 SQLite 短暂锁定），${wait}ms 后重试 ${i}/${attempts}…`,
      );
      sleepMs(wait);
    }
  }
  throw lastErr;
}

try {
  if (existsSync(examplePath) && !existsSync(envPath)) {
    copyFileSync(examplePath, envPath);
    console.info("[ensure-dev] 已创建 .env（来自 .env.example）\n");
  }

  execWithRetries("npx prisma generate", "prisma generate");

  if (process.env.SKIP_MIGRATE_ON_DEV === "1") {
    console.warn("[ensure-dev] 已跳过 migrate deploy（SKIP_MIGRATE_ON_DEV=1）\n");
  } else {
    execWithRetries("npx prisma migrate deploy", "migrate deploy");
  }
} catch (e) {
  console.error(
    "\n[ensure-dev] 失败。可依次尝试：\n" +
      "  1) npm run recover\n" +
      "  2) npm run setup\n" +
      "  3) 若数据库被占用，关闭其他访问 dev.db 的进程后再试\n" +
      "  4) 临时跳过迁移启动（不推荐）：SKIP_MIGRATE_ON_DEV=1 npm run dev\n",
  );
  console.error(e);
  process.exit(1);
}
