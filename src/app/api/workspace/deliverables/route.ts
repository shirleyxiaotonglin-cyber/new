import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inferCategoryFromMime } from "@/lib/deliverable-helpers";
import { getDeliverablesBucket, getSupabaseAdmin } from "@/lib/supabase-storage";

async function signUrl(fileKey: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const bucket = getDeliverablesBucket();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(fileKey, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * 当前用户在各已加入项目中的交付物汇总（JSON API；可按需在其它界面接入）。
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.projectMember.findMany({
    where: { userId: session.sub },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          orgId: true,
          org: { select: { name: true } },
        },
      },
    },
  });

  const projectIds = memberships.map((m) => m.project.id);
  if (projectIds.length === 0) {
    return NextResponse.json({
      items: [],
      storageConfigured: getSupabaseAdmin() !== null,
    });
  }

  const idToProject = new Map(
    memberships.map((m) => [
      m.project.id,
      {
        projectId: m.project.id,
        projectName: m.project.name,
        orgId: m.project.orgId,
        orgName: m.project.org.name,
      },
    ]),
  );

  const rows = await prisma.attachment.findMany({
    where: { task: { projectId: { in: projectIds } } },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          projectId: true,
        },
      },
      fileAsset: {
        include: {
          uploadedBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        },
      },
    },
  });

  const sorted = [...rows].sort(
    (a, b) => b.fileAsset.createdAt.getTime() - a.fileAsset.createdAt.getTime(),
  );
  const capped = sorted.slice(0, 400);

  const items = await Promise.all(
    capped.map(async (r) => {
      const p = idToProject.get(r.task.projectId);
      return {
        id: r.id,
        taskId: r.taskId,
        taskTitle: r.task.title,
        projectId: r.task.projectId,
        projectName: p?.projectName ?? "",
        projectOrgId: p?.orgId ?? "",
        orgName: p?.orgName ?? "",
        category: r.category ?? inferCategoryFromMime(r.fileAsset.mimeType),
        fileName: r.fileAsset.name,
        fileType: r.fileAsset.mimeType,
        size: r.fileAsset.size,
        version: r.fileAsset.version,
        createdAt: r.fileAsset.createdAt.toISOString(),
        uploader: r.fileAsset.uploadedBy,
        url: await signUrl(r.fileAsset.fileKey),
      };
    }),
  );

  return NextResponse.json({
    items,
    storageConfigured: getSupabaseAdmin() !== null,
  });
}
