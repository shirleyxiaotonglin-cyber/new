import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrgRole } from "@/lib/constants";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgs = await prisma.orgMember.findMany({
    where: { userId: session.sub },
    include: { org: true },
    orderBy: { joinedAt: "asc" },
  });
  return NextResponse.json({
    organizations: orgs.map((o) => ({
      id: o.org.id,
      name: o.org.name,
      slug: o.org.slug,
      role: o.role,
    })),
  });
}

const CreateBody = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const existing = await prisma.organization.findUnique({
    where: { slug: parsed.data.slug },
  });
  if (existing) {
    return NextResponse.json({ error: "Slug taken" }, { status: 409 });
  }
  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      members: {
        create: {
          userId: session.sub,
          role: OrgRole.OWNER,
        },
      },
    },
  });
  await writeAudit(org.id, session.sub, "organization", "create", { name: org.name });
  return NextResponse.json({
    organization: { id: org.id, name: org.name, slug: org.slug },
  });
}
