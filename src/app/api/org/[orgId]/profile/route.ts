import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ orgId: string }> };

const PatchBody = z.object({
  departmentId: z.string().nullable().optional(),
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

  const { departmentId } = parsed.data;

  if (departmentId === undefined) {
    return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  }

  if (departmentId !== null && departmentId !== "") {
    const dept = await prisma.department.findFirst({
      where: { id: departmentId, orgId },
    });
    if (!dept) {
      return NextResponse.json({ error: "无效的部门" }, { status: 400 });
    }
  }

  const nextDeptId =
    departmentId === "" || departmentId === null ? null : departmentId;

  await prisma.orgMember.update({
    where: { id: member.id },
    data: { departmentId: nextDeptId },
  });

  const withDept = await prisma.orgMember.findUnique({
    where: { id: member.id },
    include: {
      department: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    department: withDept?.department ?? null,
  });
}
