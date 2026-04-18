# 部署到公网

应用为 **Next.js 14 + Prisma + PostgreSQL**。无持久磁盘的托管（如 Vercel）**不能使用 SQLite**，仓库已默认使用 Postgres 迁移。

## 方案 A：Vercel + Neon（推荐，零运维）

### 1. 准备数据库（Neon）

1. 打开 [https://neon.tech](https://neon.tech) 注册并创建项目。
2. 复制 **连接串**，形如：  
   `postgresql://用户:密码@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`

### 2. 推代码到 Git

将本仓库推到 **GitHub / GitLab / Bitbucket**。

### 3. 导入 Vercel

1. 打开 [https://vercel.com](https://vercel.com) → **Add New Project** → 选择该仓库。
2. **Framework Preset** 选 **Next.js**（一般自动识别）。根目录若有子目录则选包含 `package.json` 的目录。

### 4. 环境变量（Vercel → Settings → Environment Variables）

| 变量名 | 说明 |
|--------|------|
| `DATABASE_URL` | Neon 连接串（务必带 `?sslmode=require`） |
| `JWT_SECRET` | 至少 32 位随机字符串；用于登录 Cookie，勿提交到 Git |
| `NEXT_PUBLIC_APP_URL` | 生产站点根地址，例如 `https://xxx.vercel.app` 或你的自定义域名 |

可选：

| 变量名 | 说明 |
|--------|------|
| `OPENROUTER_API_KEY` | 任务「AI 文本分析」功能 |
| `OPENROUTER_MODEL` | 默认如 `openai/gpt-4o-mini` |

对所有环境勾选 **Production** / **Preview**（至少 Production）。

### 5. 部署

点击 **Deploy**。构建会执行 `scripts/build.mjs` → `prisma migrate deploy` 在 Neon 上建表。

部署完成后用 `https://你的域名` 访问。若登录态/重定向异常，检查 `NEXT_PUBLIC_APP_URL` 是否与浏览器地址完全一致（含 `https`）。

### 6. 演示数据（可选）

在**本机**临时把 `.env` 的 `DATABASE_URL` 改成与生产相同，然后：

```bash
npm install
npm run db:seed
```

演示账号（与 seed 一致）：`demo@projecthub.io` / `demo123456`。

---

## 方案 B：Docker 自有服务器 / Railway / Fly.io

在目标环境提供：

- Node 20+
- `DATABASE_URL`（任意托管 Postgres）
- 同上环境变量

构建与启动示例：

```bash
npm ci
npm run build
npm run start
```

生产启动前确保已对目标库执行：`npx prisma migrate deploy`。

---

## 本地开发（Postgres）

1. `docker compose up -d`
2. 复制 `.env.example` 为 `.env`（默认已指向 `localhost:5432/projecthub`）
3. `npm run setup` → `npm run dev`

---

## 自定义域名

在 Vercel → **Settings** → **Domains** 绑定域名，并把 `NEXT_PUBLIC_APP_URL` 改为 `https://你的域名`。

---

## 常见问题

### 协作 / 实时（SSE）在 Vercel 上中断

Serverless 对**长连接**有时长限制：项目里 `src/app/api/projects/[projectId]/stream/route.ts` 已设置 `maxDuration`。**免费档**单函数约 10s 上限，长时在线协作可升级 Vercel Pro，或改用 **Railway、Render、自有 VPS** 跑 `next start` 单进程。

### 构建报数据库错误

确认 Vercel 已配置 `DATABASE_URL`，且 Neon 允许从你所在区域连接（Neon 控制台 Firewall / IP 一般默认全开）。

### 仅从编译验证（无数据库）

```bash
SKIP_PRISMA_MIGRATE=1 npm run build
```

---

## 中国大陆访问

站点托管在海外时，无需改代码即可访问；若需备案或更低延迟，可将同一套 Docker / Node 部署到境内云厂商，仍使用 Postgres（如阿里云 RDS）。

---

## 从早期 SQLite（`dev.db`）迁移

当前仓库默认 **PostgreSQL**。本地若曾有 `dev.db`，数据**不会自动迁移**。可选：

1. **重新开始**：`docker compose up -d` → 配置 `.env` 中 `DATABASE_URL` → `npm run setup`（含 seed）。
2. **自行搬迁**：用数据库工具将 SQLite 数据导出再导入 Postgres（表结构已变，需谨慎对照）。

旧版 `file:./dev.db` 的 `.env` 需改为 Postgres 连接串，否则 Prisma 会报错。
