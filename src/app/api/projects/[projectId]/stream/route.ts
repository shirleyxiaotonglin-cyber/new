import { listProjectPresence, subscribeProject } from "@/lib/project-realtime";
import { getSession } from "@/lib/auth";
import { requireProjectAccess } from "@/lib/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Hobby 单函数约 10s；EventSource 会断线重连。Pro 可改为 300 */
export const maxDuration = 10;

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { projectId } = await ctx.params;
  const access = await requireProjectAccess(projectId, session.sub);
  if (!access) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      send({ type: "connected", projectId });
      send({ type: "presence", viewers: listProjectPresence(projectId) });

      const unsub = subscribeProject(projectId, (payload) => {
        send(payload);
      });

      const ping = setInterval(() => {
        send({ type: "ping", t: Date.now() });
      }, 25_000);

      const ac = req.signal;
      const onAbort = () => {
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      ac.addEventListener("abort", onAbort, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
