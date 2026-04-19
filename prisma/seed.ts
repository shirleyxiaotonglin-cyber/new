import { PrismaClient } from "@prisma/client";
import {
  ProjectMemberRole,
  ProjectTemplate,
  TaskPriority,
  TaskStatus,
  ActivityAction,
} from "../src/lib/constants";
import {
  ensureDemoUserAndOrg,
  DEMO_EMAIL,
  DEMO_ORG_SLUG,
} from "../src/lib/demo-account";

const prisma = new PrismaClient();

async function main() {
  await ensureDemoUserAndOrg();

  const user = await prisma.user.findUniqueOrThrow({
    where: { email: DEMO_EMAIL },
  });
  const org = await prisma.organization.findUniqueOrThrow({
    where: { slug: DEMO_ORG_SLUG },
  });

  await prisma.team.upsert({
    where: { id: "seed-team-product" },
    update: {},
    create: {
      id: "seed-team-product",
      orgId: org.id,
      name: "Product",
      members: { create: { userId: user.id } },
    },
  });

  const project = await prisma.project.upsert({
    where: { id: "seed-project-main" },
    update: {},
    create: {
      id: "seed-project-main",
      orgId: org.id,
      name: "FY2026 产品研发",
      description: "企业级项目管理示例项目 — 含看板、列表、甘特与度量。",
      template: ProjectTemplate.ENGINEERING,
      members: {
        create: { userId: user.id, role: ProjectMemberRole.OWNER },
      },
    },
  });

  await prisma.taskDependency.deleteMany({
    where: {
      OR: [
        { successor: { projectId: project.id } },
        { predecessor: { projectId: project.id } },
      ],
    },
  });
  await prisma.task.deleteMany({ where: { projectId: project.id } });
  await prisma.workflow.deleteMany({ where: { projectId: project.id } });
  await prisma.automationRule.deleteMany({ where: { projectId: project.id } });

  const tagBackend = await prisma.tag.upsert({
    where: {
      projectId_name: { projectId: project.id, name: "后端" },
    },
    update: {},
    create: {
      projectId: project.id,
      name: "后端",
      color: "#2563eb",
    },
  });
  const tagFrontend = await prisma.tag.upsert({
    where: {
      projectId_name: { projectId: project.id, name: "前端" },
    },
    update: {},
    create: {
      projectId: project.id,
      name: "前端",
      color: "#7c3aed",
    },
  });

  const tasksSpec = [
    {
      title: "架构与技术栈选型",
      status: TaskStatus.DONE,
      priority: TaskPriority.P0,
      days: -14,
      span: 3,
      progress: 100,
      tags: [tagBackend],
    },
    {
      title: "多租户与 RBAC 数据模型",
      status: TaskStatus.DOING,
      priority: TaskPriority.P0,
      days: -7,
      span: 7,
      progress: 62.5,
      tags: [tagBackend],
    },
    {
      title: "任务 API 与审计日志",
      status: TaskStatus.TODO,
      priority: TaskPriority.P1,
      days: 0,
      span: 5,
      progress: 0,
      tags: [tagBackend],
    },
    {
      title: "看板与甘特图前端",
      status: TaskStatus.DOING,
      priority: TaskPriority.P1,
      days: -3,
      span: 10,
      progress: 38,
      tags: [tagFrontend],
    },
    {
      title: "通知与搜索",
      status: TaskStatus.BLOCKED,
      priority: TaskPriority.P2,
      days: 5,
      span: 4,
      progress: 12.5,
      tags: [tagFrontend, tagBackend],
    },
  ];

  let order = 0;
  const base = new Date();
  base.setHours(0, 0, 0, 0);

  let predecessorId: string | null = null;

  for (const spec of tasksSpec) {
    const start = new Date(base);
    start.setDate(start.getDate() + spec.days);
    const due = new Date(start);
    due.setDate(due.getDate() + spec.span);

    const t = await prisma.task.create({
      data: {
        projectId: project.id,
        title: spec.title,
        status: spec.status,
        priority: spec.priority,
        progress: spec.progress,
        assigneeId: user.id,
        sortOrder: order++,
        startDate: start,
        dueDate: due,
        tags: {
          createMany: {
            data: spec.tags.map((tag) => ({ tagId: tag.id })),
          },
        },
        activities: {
          create: {
            userId: user.id,
            action: ActivityAction.TASK_CREATED,
            meta: JSON.stringify({ title: spec.title }),
          },
        },
      },
    });

    if (predecessorId) {
      await prisma.taskDependency.create({
        data: {
          successorId: t.id,
          predecessorId,
        },
      });
    }
    predecessorId = t.id;
  }

  await prisma.workflow.create({
    data: {
      projectId: project.id,
      name: "标准研发流程",
      isDefault: true,
      states: {
        create: [
          { name: "待办", category: "backlog" },
          { name: "进行中", category: "in_progress" },
          { name: "已完成", category: "done" },
        ],
      },
    },
  });

  await prisma.automationRule.create({
    data: {
      projectId: project.id,
      name: "逾期提醒（示例）",
      trigger: "task.overdue",
      condition: JSON.stringify({ hours: 24 }),
      actions: JSON.stringify([
        { type: "notify.assignee", channel: "IN_APP" },
        { type: "notify.project_admins", channel: "EMAIL" },
      ]),
    },
  });

  console.info("Seed OK — login: demo@projecthub.io / demo123456");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
