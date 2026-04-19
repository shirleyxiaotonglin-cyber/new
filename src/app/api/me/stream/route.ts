import { subscribeUser } from "@/lib/user-realtime";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  const uid = session.sub;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      send({ type: "connected", userId: uid });

      const unsub = subscribeUser(uid, (payload) => {
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
