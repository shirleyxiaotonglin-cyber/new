# 部署到公网

应用为 **Next.js 14 + Prisma + PostgreSQL**。无持久磁盘的托管（如 Vercel）**不能使用 SQLite**，仓库已默认使用 Postgres 迁移。

邮箱注册、登录与数据归属账号由应用自身 API + Postgres 完成；数据库使用 **Neon / Supabase / 任意 Postgres** 均可。

## 方案 A（补充）：Supabase 作为数据库

你的 Supabase 项目控制台：<https://supabase.com/dashboard/project/eueryfsdyesxcrwotvnz>

1. 左侧 **Project Settings**（齿轮）→ **Database**。  
2. 复制 **Database password**（若忘了可 **Reset database password**）。  
3. **Connection string** → 选 **URI**，把 `[YOUR-PASSWORD]` 换成真实密码。

在 **`.env` / Vercel 环境变量** 中配置两项（含义见 `.env.example`）：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 建议使用 **Session pooler / Transaction** 连接串（适合 Vercel Serverless）；若文档中带 `?pgbouncer=true` 请保留。 |
| `DIRECT_URL` | **直连**（通常为端口 **5432**、不走 pooler），供 `prisma migrate deploy` 建表。 |

本地开发若直连本机 Postgres，无连接池时，可将 **`DATABASE_URL` 与 `DIRECT_URL` 设为同一串**。

4. 终端执行（对齐远程库结构）：

```bash
npx prisma migrate deploy
```

5. （可选）演示数据：`npm run db:seed`。

> **说明**：当前仓库使用 **自建邮箱密码注册**（`/api/auth/register`），密码哈希存在你的 Postgres `User` 表中，**不要求**启用 Supabase Auth。若日后要改用 Supabase Auth，需单独接入 `@supabase/supabase-js` 并与 Prisma 用户表对齐。

---

## 方案 B：Vercel + Neon（推荐，零运维）

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

在 Neon **Connection details** 里通常有两种连接串，需要**分开**填：

| 变量名 | 说明 |
|--------|------|
| `DATABASE_URL` | 使用 **Pooled**（连接串里主机名常含 `-pooler`），适合 Vercel Serverless。务必带 `?sslmode=require`。 |
| `DIRECT_URL` | 使用 **Direct**（直连，主机名**不应**含 `pooler`）。供 `prisma migrate deploy`；若误把 Pooler 填进 `DIRECT_URL`，构建会出现 **P1002 / advisory lock 超时**。 |

若本地开发只有一条直连串，本地可将 `DATABASE_URL` 与 `DIRECT_URL` 设为相同；**上 Vercel + Neon 时务必按上表区分**。
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

---

## 重新接入 OpenRouter（智能任务解析 / 计划表 / 工作报告）

智能相关功能走 **OpenRouter** 统一网关（`https://openrouter.ai/api/v1/chat/completions`），与 DeepSeek / OpenAI 官网单独申请的 Key **不是同一套**；必须用 **OpenRouter 控制台里的 Key** 和在 OpenRouter 模型列表里显示的 **完整模型 ID**（形如 `deepseek/deepseek-v3.2`，不能只写 `deepseek`）。

### 1. 在 OpenRouter 侧准备

1. 打开 [https://openrouter.ai](https://openrouter.ai) 注册并登录。  
2. **Credits**：充值或绑定支付方式，保证有余额（调用按 token 计费）。  
3. **Keys**：**Keys** 页面创建 API Key，复制形如 `sk-or-v1-...` 的字符串（只显示一次，请妥善保存）。  
4. **模型**：在 [Models](https://openrouter.ai/models) 搜索你要用的模型（如 DeepSeek），点开详情页，复制 **完整 Model ID**（含 `厂商/模型名`），例如 `deepseek/deepseek-v3.2`。

### 2. 在本项目里配置环境变量

复制 `.env.example` 中 OpenRouter 相关注释，在项目根目录 **`.env`**（本地）写入至少：

| 变量 | 必填 | 说明 |
|------|------|------|
| `OPENROUTER_API_KEY` | 是 | 上一步复制的 `sk-or-v1-...` |
| `OPENROUTER_MODEL` | 否 | 不填时服务端默认 `openai/gpt-4o-mini`；用 DeepSeek 等须填完整 ID |
| `OPENROUTER_ANALYZE_TIMEOUT_MS` | 否 | 智能解析等待 OpenRouter 的上限（毫秒），默认 `45000`；模型很慢可调高（见 `.env.example`） |
| `OPENROUTER_FALLBACK_MODEL` | 否 | 主模型若遇 403，会自动改试该备用模型 |
| `OPENROUTER_HTTP_REFERER` | 否 | 生产环境若 Referer 审核异常，可设为站点根 URL `https://你的域名` |

本地改完 **`.env`** 后需 **重启** `npm run dev`。

### 3. 在 Vercel（或其它托管）上配置

1. 进入项目 → **Settings** → **Environment Variables**。  
2. 添加上表同名变量；**Value** 不要带引号。  
3. 至少勾选 **Production**（需要的话再勾选 Preview）。  
4. **保存后必须 Redeploy**（Deployments → 最新部署右侧 **⋯** → **Redeploy**），否则线上进程仍用旧环境。

### 4. 验证是否接通

1. 浏览器登录应用 → 进入任意项目 → 顶部切到 **AI / 智能任务解析**。  
2. 若显示 **「智能助手已就绪」** 且下方有 **模型标识**（与 `OPENROUTER_MODEL` 一致），说明 status 接口已读到 Key 与模型。  
3. 粘贴一段不少于约 10 字的文本，点 **预览解析结果**：应返回真实任务列表；若返回 **示例任务** 且 `fallback: true`，多为超时、余额或模型 ID 错误，见下一步。

### 5. 常见问题

| 现象 | 处理方向 |
|------|-----------|
| 页面上长期「智能助手未开通」 | 线上未注入 `OPENROUTER_API_KEY` 或未 Redeploy |
| 接口返回示例任务 / `fallback: true` | 超时：可调 `OPENROUTER_ANALYZE_TIMEOUT_MS`、升级 Vercel 套餐延长函数时间；或换更快模型 |
| OpenRouter 报错 / 402 / 余额 | 在 OpenRouter 控制台充值 |
| 403 / 模型不可用 | 核对模型 ID 是否与官网一致；可设 `OPENROUTER_FALLBACK_MODEL` |

更细的字段说明仍以仓库根目录 **`.env.example`** 为准。

---

### 6. 演示数据（可选）

在**本机**临时把 `.env` 的 `DATABASE_URL` 改成与生产相同，然后：

```bash
npm install
npm run db:seed
```

演示账号（与 `src/lib/demo-account.ts` / seed 一致）：`435236356@qq.com` / `12345678`。

---

## 方案 C：Docker 自有服务器 / Railway / Fly.io

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
