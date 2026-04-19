import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ orgId: string }> };

const PatchBody = z.object({
  /** 预设部门 ID（组织内 Department）；单独发送时不影响 departmentText */
  departmentId: z.string().nullable().optional(),
  /** 自行填写的部门；空字符串表示清空该项。若为非空正文，会清空预设 departmentId */
  departmentText: z.union([z.string().max(120), z.literal(""), z.null()]).optional(),
});

/** 当前用户在本组织的资料（部门等） */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { orgId } = await ctx.params;

  const member = await prisma.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: session.sub } },
  });
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { departmentId, departmentText } = parsed.data;

  if (departmentId === undefined && departmentText === undefined) {
    return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  }

  type RowUp = { departmentId?: string | null; departmentText?: string | null };
  const row: RowUp = {};

  if (departmentText !== undefined) {
    const trimmed = (departmentText ?? "").trim();
    if (trimmed.length > 0) {
      row.departmentText = trimmed.slice(0, 120);
      row.departmentId = null;
    } else {
      row.departmentText = null;
      row.departmentId = null;
    }
  }

  if (departmentId !== undefined && departmentText === undefined) {
    if (departmentId === null || departmentId === "") {
      row.departmentId = null;
      row.departmentText = null;
    } else {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, orgId },
      });
      if (!dept) {
        return NextResponse.json({ error: "无效的部门" }, { status: 400 });
      }
      row.departmentId = departmentId;
      row.departmentText = null;
    }
  }

  await prisma.orgMember.update({
    where: { id: member.id },
    data: row,
  });

  const withDept = await prisma.orgMember.findUnique({
    where: { id: member.id },
    include: {
      department: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    department: withDept?.department ?? null,
    departmentText: withDept?.departmentText ?? null,
  });
}
