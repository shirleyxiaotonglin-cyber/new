import { existsSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 自检接口：数据库是否可用、是否有演示数据、常见配置提示。
 * 访问: GET /api/diagnostics
 */
export async function GET() {
  const cwd = process.cwd();
  const legacySqlite = join(cwd, "prisma", "dev.db");
  const legacySqliteExists = existsSync(legacySqlite);
  const hints: string[] = [];

  if (!process.env.DATABASE_URL) {
    hints.push("缺少 DATABASE_URL，请复制 .env.example 为 .env（需 Postgres，本地可 docker compose up -d）");
  } else if (process.env.DATABASE_URL.startsWith("file:")) {
    hints.push(
      "DATABASE_URL 仍为 SQLite（file:）。当前 schema 使用 PostgreSQL；请改用 postgres 连接串（见 DEPLOY.md、.env.example）",
    );
  }

  let dbOk = false;
  let error: string | undefined;
  let counts = { users: 0, organizations: 0, projects: 0, tasks: 0 };

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    const [users, organizations, projects, tasks] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.project.count(),
      prisma.task.count(),
    ]);
    counts = { users, organizations, projects, tasks };
    if (users === 0) {
      hints.push("数据库中无用户，请执行: npm run db:seed");
    }
    if (organizations === 0 && users > 0) {
      hints.push("有用户但无组织数据异常，可尝试: npm run setup");
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    hints.push("数据库无法连接。请在项目根目录执行：npm run setup");
  }

  const ok = dbOk && counts.users > 0 && counts.organizations > 0;

  return NextResponse.json(
    {
      ok,
      app: "projecthub",
      ts: new Date().toISOString(),
      cwd,
      databaseUrlSet: Boolean(process.env.DATABASE_URL),
      legacySqliteFile: { path: legacySqlite, exists: legacySqliteExists },
      db: { connected: dbOk, error },
      counts,
      hints,
      loginTip:
        "浏览器按「端口」区分登录状态；若终端显示端口不是 3000，请用对应 http://localhost:该端口 访问，勿混用。",
      troubleshoot: [
        "页面空白或控制台 Chunk / 模块缺失：在项目根目录执行 npm run recover，再 npm run dev",
        "npm run dev 起不来（ensure-dev 失败）：关闭占用 SQLite 的其他进程后重试，或执行 npm run setup",
        "仍异常：DISABLE_WEBPACK_CACHE=1 npm run dev 或查看终端完整报错",
      ],
    },
    { status: ok ? 200 : 503 },
  );
}
