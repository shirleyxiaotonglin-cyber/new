import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  GanttChart,
  Kanban,
  LayoutDashboard,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";

export default async function Home() {
  const session = await getSession();
  if (session) {
    const first = await prisma.orgMember.findFirst({
      where: { userId: session.sub },
      orderBy: { joinedAt: "asc" },
    });
    if (first) {
      redirect(`/org/${first.orgId}`);
    }
  }

  const features = [
    { icon: LayoutDashboard, title: "多空间 / 组织", desc: "Workspace 级隔离，模板化立项。" },
    { icon: Kanban, title: "看板 · 列表 · 甘特", desc: "多视图同步，拖拽改状态。" },
    { icon: Users, title: "角色与协作", desc: "Owner / Admin / Member / Guest，评论与 @ 提醒。" },
    { icon: Lock, title: "安全与审计", desc: "RBAC、操作审计日志，可接多租户 SaaS。" },
    { icon: BarChart3, title: "报表与负载", desc: "完成率、延期风险、工作量分布。" },
    { icon: Sparkles, title: "AI 与自动化", desc: "PRD 拆解、规则引擎（可接 LLM）。" },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex max-w-[min(100%,14rem)] flex-col sm:max-w-none">
            <Link href="/" className="text-base font-bold leading-tight tracking-tight text-red-600 sm:text-lg">
              {PRODUCT_NAME}
            </Link>
            <span className="mt-0.5 hidden text-[11px] font-normal text-gray-500 sm:block">
              {PRODUCT_TAGLINE}
            </span>
          </span>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700"
            >
              登录
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-b from-red-50/80 via-white to-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(220,38,38,0.12),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24">
          <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
            Enterprise Project Management
          </p>
          <h1 className="mt-4 text-center text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            企业级项目协作
            <span className="block text-red-600 sm:inline sm:before:content-[''] sm:before:px-2">·</span>
            <span className="block sm:inline">一页掌握进度</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-relaxed text-gray-600">
            在浏览器中开箱即用：白底界面、红色导航、看板与甘特、权限与审计。适合研发团队与市场、活动等多模板项目。
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex rounded-xl bg-red-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700"
            >
              免费开始使用
            </Link>
            <span className="text-sm text-gray-500">演示账号见登录页</span>
          </div>
          <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-gray-200 bg-gray-50/80 p-6 shadow-inner sm:p-10">
            <div className="flex flex-wrap items-center justify-center gap-8 text-center text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <GanttChart className="h-5 w-5 text-red-500" />
                时间轴 / 甘特
              </div>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <Kanban className="h-5 w-5 text-red-500" />
                看板拖拽
              </div>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-red-500" />
                数据看板
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">核心能力</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
          面向网页访问场景优化：响应式布局，手机端侧栏抽屉，桌面端左侧固定导航。
        </p>
        <ul className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <li
              key={title}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-red-100 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-gray-100 bg-gray-50/80 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-bold text-gray-900">本地运行</h2>
          <p className="mt-3 text-sm text-gray-600">
            使用 Node.js 启动开发服务，浏览器访问即可。生产环境可部署至 Vercel、自有服务器（需
            PostgreSQL）。
          </p>
          <pre className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-gray-900 px-4 py-4 text-left text-sm text-gray-100">
            <code>
              {`npm install
npm run setup
npm run dev
# 以终端显示的端口为准打开 http://localhost:端口
# 自检: http://localhost:端口/api/diagnostics`}
            </code>
          </pre>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-gray-500 sm:flex-row sm:px-6">
          <span>
            © {new Date().getFullYear()} {PRODUCT_NAME} · 网页端项目管理演示
          </span>
          <Link href="/login" className="font-medium text-red-600 hover:text-red-700">
            进入登录
          </Link>
        </div>
      </footer>
    </div>
  );
}
