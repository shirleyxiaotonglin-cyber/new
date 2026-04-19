import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { getOpenRouterAttribution } from "@/lib/openrouter";

type Ctx = { params: Promise<{ projectId: string }> };

/** 供项目页 AI 功能区展示：是否已配置 OpenRouter，以及将使用的模型 id（不含密钥）。 */
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configured = Boolean(process.env.OPENROUTER_API_KEY?.trim());
  const model = process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";
  const att = getOpenRouterAttribution();

  return NextResponse.json({
    configured,
    model,
    refererSource: att.refererSource,
    /** 将发给 OpenRouter 的 HTTP-Referer；omitted 时为 null */
    effectiveHttpReferer: att.omitAttribution ? null : att.referer,
    appTitle: att.title,
    omitAttribution: att.omitAttribution,
  });
}
