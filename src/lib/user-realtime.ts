import { EventEmitter } from "events";

/** Per-user WebSocket-like bus for DM（单进程；多实例需 Redis pub/sub） */
const userBuses = new Map<string, EventEmitter>();

function userBus(userId: string): EventEmitter {
  let b = userBuses.get(userId);
  if (!b) {
    b = new EventEmitter();
    b.setMaxListeners(200);
    userBuses.set(userId, b);
  }
  return b;
}

export type UserRealtimePayload = Record<string, unknown>;

export function emitToUser(userId: string, payload: UserRealtimePayload) {
  userBus(userId).emit("msg", payload);
}

export function subscribeUser(
  userId: string,
  fn: (payload: UserRealtimePayload) => void,
): () => void {
  const b = userBus(userId);
  const handler = (p: UserRealtimePayload) => fn(p);
  b.on("msg", handler);
  return () => {
    b.off("msg", handler);
  };
}
