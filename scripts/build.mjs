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

/** libpq：延长连接建立超时（秒），便于 Neon 冷启动 */
function withConnectTimeout(url, seconds = 120) {
  const u = url.trim();
  if (/[?&]connect_timeout=/i.test(u)) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}connect_timeout=${seconds}`;
}

/**
 * Neon 复制串常带 channel_binding=require；少数环境下与 Prisma 迁移抢 advisory lock 并存异常。
 * 迁移子进程内去掉该参数（保留 sslmode=require），与应用运行时连接串无关。
 */
function stripChannelBindingFromUrl(url) {
  const raw = url.trim();
  if (!/[?&]channel_binding=/i.test(raw)) return raw;
  try {
    const normalized = raw.startsWith("postgresql:") ? raw.replace(/^postgresql:/i, "http:") : raw;
    const u = new URL(normalized);
    u.searchParams.delete("channel_binding");
    return u.toString().replace(/^http:/i, "postgresql:");
  } catch {
    return raw
      .replace(/[&?]channel_binding=[^&]*/gi, "")
      .replace(/\?&/g, "?")
      .replace(/\?$/g, "");
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

function migrateDeployWithRetries(directConnectionUrl, maxAttempts = 8) {
  const urlForMigrate = withConnectTimeout(stripChannelBindingFromUrl(directConnectionUrl));
  const migrateEnv = {
    ...process.env,
    DATABASE_URL: urlForMigrate,
    DIRECT_URL: urlForMigrate,
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
        /* Prisma 内部抢 advisory lock 默认约 10s；并发部署或 Neon 唤醒不足时需更长间隔 */
        const waitSec = Math.min(15 + attempt * 8, 90);
        console.warn(
          `\n[build] prisma migrate deploy 第 ${attempt} 次失败（可能是并发迁移抢锁 / Neon 冷启动），${waitSec}s 后重试 (${attempt + 1}/${maxAttempts})…\n`,
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

function explainAdvisoryLockFailure() {
  console.error(`
当前已走直连仍报 P1002（advisory lock / 超时）时，可按下面排查：

  1) **并发构建**：多个 Vercel Deployment 同时对同一库跑 migrate，会互相抢锁。请到 Vercel → Deployments，
     取消排队中的重复构建，只保留当前一条；或关闭「并发部署同一分支」类选项后再试。
  2) **Neon 休眠**：在 Neon 控制台打开该项目/SQL Editor 执行一次 SELECT 1，唤醒计算后再 Redeploy。
  3) **本地跑一次迁移**：把 Neon 直连串设为 DATABASE_URL 与 DIRECT_URL（或仅用直连），在本机执行：
       npx prisma migrate deploy
     成功后再推送触发 Vercel（此时迁移通常已是 applied，构建会很快通过）。
  4) **临时跳过构建迁移**：设 SKIP_PRISMA_MIGRATE=1 先让站点上线，再在本地或 CI 对同一库执行 migrate deploy。

  5) **连接串里的 channel_binding=require**：若从 Neon 整串复制，可在 .env 里删掉该参数后再执行 migrate（仅去掉参数，保留 sslmode=require）。

构建阶段可加环境变量 SKIP_NEON_WAKE_SLEEP=1 跳过下面的等待（仅调试用）。
`);
}

try {
  run("npx prisma generate");
  run("node scripts/sync-static-site.mjs");

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
    const wakeSleep =
      process.env.SKIP_NEON_WAKE_SLEEP === "1" ? 0 : process.env.VERCEL ? 28 : 0;
    if (wakeSleep > 0) {
      console.warn(
        `\n[build] 检测到 VERCEL：等待 ${wakeSleep} 秒以便 Neon 计算唤醒后再跑 migrate（可用 SKIP_NEON_WAKE_SLEEP=1 跳过）。\n`,
      );
      sleepSync(wakeSleep);
    }

    try {
      migrateDeployWithRetries(directUrl, 8);
    } catch {
      console.warn("\n[build] prisma migrate deploy 失败。\n");
      explainAdvisoryLockFailure();
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
