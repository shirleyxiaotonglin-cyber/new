/**
 * 生产构建：generate → migrate deploy（除非 SKIP_PRISMA_MIGRATE=1）→ next build
 * Prisma CLI 会从项目根目录加载 .env；Supabase 需 DATABASE_URL + DIRECT_URL。
 *
 * Neon：DATABASE_URL 用带 -pooler 的池化串；DIRECT_URL 必须用控制台「Direct」直连串（主机名不含 pooler），
 * 否则 migrate 可能出现 P1002 / advisory lock 超时。
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

/** Neon / PgBouncer 池地址不宜用于 prisma migrate（advisory lock） */
function connectionLooksLikePooler(url) {
  if (!url || typeof url !== "string") return false;
  return /pooler/i.test(url);
}

function sleepSync(seconds) {
  try {
    execSync(`sleep ${seconds}`, { stdio: "ignore" });
  } catch {
    /* Windows 本地构建时可忽略 */
  }
}

/**
 * 迁移子进程内将 DATABASE_URL 与 DIRECT_URL 均设为直连串。
 * 避免 Prisma CLI 在部分环境下仍以主 url（池化）建连，导致 …-pooler… 上 advisory lock 超时。
 */
function migrateDeployOnce(migrateEnv) {
  execSync("npx prisma migrate deploy", {
    cwd: root,
    stdio: "inherit",
    env: migrateEnv,
  });
}

function migrateDeployWithRetries(directConnectionUrl, maxAttempts = 3) {
  const migrateEnv = {
    ...process.env,
    DATABASE_URL: directConnectionUrl,
    DIRECT_URL: directConnectionUrl,
  };
  console.warn(
    "\n[build] prisma migrate deploy：迁移步骤已强制使用 DIRECT_URL（直连），不在此步骤使用池化 DATABASE_URL。\n",
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      migrateDeployOnce(migrateEnv);
      return;
    } catch {
      if (attempt < maxAttempts) {
        const waitSec = 5 * attempt;
        console.warn(
          `\n[build] prisma migrate deploy 第 ${attempt} 次失败（可能是 Neon 冷启动或瞬时锁），${waitSec}s 后重试 (${attempt + 1}/${maxAttempts})…\n`,
        );
        sleepSync(waitSec);
      }
    }
  }
  throw new Error(`migrate deploy failed after ${maxAttempts} attempts`);
}

function explainNeonDirectUrl() {
  console.error(`
排查步骤（Neon + Vercel）：
  1) Neon Dashboard → 该项目 → Connection details，展开两条连接串。
  2) 「Pooled」→ 仅填入 Vercel 的 DATABASE_URL。
  3) 「Direct」（主机名不含 pooler）→ 填入 Vercel 的 DIRECT_URL。
  4) 切勿把两条填成同一个 Pooler 串；保存后 Redeploy。

若构建日志里仍出现 …-pooler….neon.tech，说明迁移仍在走池化连接，优先检查 DIRECT_URL。
`);
}

try {
  run("npx prisma generate");

  const skipMigrate = process.env.SKIP_PRISMA_MIGRATE === "1";

  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  const directUrl = process.env.DIRECT_URL?.trim() ?? "";

  if (!skipMigrate && (!dbUrl || !directUrl)) {
    console.error(`
[build] 缺少 DATABASE_URL 或 DIRECT_URL。

Prisma 需要：
  • DATABASE_URL — 应用查询（Neon 可用带 pooler 的串）
  • DIRECT_URL — prisma migrate deploy 用直连（Neon「Direct」串，主机名不应含 pooler）

在 Vercel：Project → Settings → Environment Variables 添加两项。
`);
    process.exit(1);
  }

  if (!skipMigrate && connectionLooksLikePooler(directUrl)) {
    console.error(`
[build] DIRECT_URL 疑似为连接池地址（连接串中含 “pooler”）。

prisma migrate deploy 必须使用 Postgres 直连，不能使用 Neon Pooler / PgBouncer 池地址，
否则会触发 P1002：Timed out trying to acquire a postgres advisory lock。
`);
    explainNeonDirectUrl();
    process.exit(1);
  }

  if (!skipMigrate && connectionLooksLikePooler(dbUrl) && dbUrl === directUrl) {
    console.error(`
[build] DATABASE_URL 与 DIRECT_URL 完全相同，且含连接池地址（pooler）。

Neon 在 Vercel 上应使用两条不同连接串：
  • DATABASE_URL = Pooled（含 pooler）
  • DIRECT_URL = Direct（不含 pooler）

不能把同一串复制进两个变量。
`);
    explainNeonDirectUrl();
    process.exit(1);
  }

  if (
    !skipMigrate &&
    connectionLooksLikePooler(dbUrl) &&
    connectionLooksLikePooler(directUrl) &&
    dbUrl !== directUrl
  ) {
    console.error(`
[build] DATABASE_URL 与 DIRECT_URL 看起来都是连接池地址（均含 pooler）。

请至少将 DIRECT_URL 换成 Neon「Direct」直连串。
`);
    explainNeonDirectUrl();
    process.exit(1);
  }

  if (!skipMigrate) {
    try {
      migrateDeployWithRetries(directUrl, 3);
    } catch {
      console.warn("\n[build] prisma migrate deploy 失败。\n");
      if (connectionLooksLikePooler(dbUrl)) {
        console.error(
          "[build] 当前 DATABASE_URL 含 pooler；若日志里迁移仍连到 …-pooler…，说明 DIRECT_URL 未生效或为池地址。\n",
        );
        explainNeonDirectUrl();
      }
      console.warn(
        "可临时设 SKIP_PRISMA_MIGRATE=1 仅通过构建，再在本地用 Direct 串执行：npx prisma migrate deploy\n",
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
