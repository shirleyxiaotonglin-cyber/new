import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";
import { z } from "zod";
import { TaskPriority, TaskStatus } from "@/lib/constants";

type Ctx = { params: Promise<{ projectId: string }> };

const Body = z.object({
  prd: z.string().min(20),
});

/** Stub “AI” breakdown — swap for OpenAI / Claude API calls. */
export async function POST(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "PRD too short or invalid" }, { status: 400 });
  }

  const sentences = parsed.data.prd
    .split(/[\n\.。]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4)
    .slice(0, 12);

  const suggestions = sentences.map((title, i) => ({
    title: title.slice(0, 120),
    priority: i < 2 ? TaskPriority.P0 : TaskPriority.P2,
    status: TaskStatus.TODO,
    hint: "由本地规则从 PRD 句子拆解（可替换为 LLM）",
  }));

  return NextResponse.json({ suggestions });
}
