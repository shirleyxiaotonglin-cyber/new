import Link from "next/link";
import { redirect } from "next/navigation";
import {
  FolderOpen,
  GanttChart,
  LayoutList,
  MessageSquare,
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
      /** 与 /api/auth/me、`getPrimaryOrgMembership` 一致：首个加入的组织为唯一工作空间 */
      orderBy: { joinedAt: "asc" },
    });
    if (first) {
      redirect(`/org/${first.orgId}`);
    }
  }

  const features = [
    {
      icon: LayoutList,
      title: "项目与任务管理",
      desc: "按组织、项目组织工作；看板/列表/任务侧栏中创建、编辑、状态与优先级、负责人与协助人、子任务、依赖与标签，并支持「我的任务」跨项目查看。",
    },
    {
      icon: GanttChart,
      title: "甘特图系统",
      desc: "时间轴与条带展示起止、进度与依赖，与看板/列表数据同源，便于排期与同步。",
    },
    {
      icon: Users,
      title: "多人协作",
      desc: "组织与项目成员、角色与项目内权限；项目内可展示协作者在线与任务侧分配，支持活动与状态同步。",
    },
    {
      icon: MessageSquare,
      title: "评论与消息",
      desc: "任务内讨论、项目与系统活动；组织内私信与消息中心，与任务/项目数据关联。",
    },
    {
      icon: FolderOpen,
      title: "文件与资源中心",
      desc: "任务内上传交付物；项目「资源中心」汇总全项目文件，支持预览/下载，大文件可经对象存储直传。",
    },
    {
      icon: Sparkles,
      title: "AI 智能助手",
      desc: "项目内用自然语言解析为任务批量创建（需配置 OpenRouter）；与手动建任务、侧栏编辑并存。",
    },
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
            核心目标是把「任务管理、进度可视化、文件交付、团队协作与 AI
            辅助」整合到一个统一平台中，实现从项目创建到执行交付的完整闭环。
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex rounded-xl bg-red-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700"
            >
              免费开始使用
            </Link>
          </div>
          <div className="mx-auto mt-16 max-w-4xl rounded-2xl border border-gray-200 bg-gray-50/80 p-6 shadow-inner sm:p-10">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-center text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <LayoutList className="h-5 w-5 text-red-500" />
                项目与任务
              </div>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <GanttChart className="h-5 w-5 text-red-500" />
                甘特排期
              </div>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-red-500" />
                多人协作
              </div>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-red-500" />
                评论与消息
              </div>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-red-500" />
                文件与资源
              </div>
              <div className="hidden h-8 w-px bg-gray-200 sm:block" />
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-red-500" />
                AI 助手
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-gray-900 sm:text-3xl">核心能力</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-gray-600">
          以下为产品内已实现能力的概括；详细以登录后的界面为准。
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
            © {new Date().getFullYear()} {PRODUCT_NAME}
          </span>
          <Link href="/login" className="font-medium text-red-600 hover:text-red-700">
            进入登录
          </Link>
        </div>
      </footer>
    </div>
  );
}
