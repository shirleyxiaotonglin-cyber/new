import { EventEmitter } from "events";

/**
 * In-process realtime bus per project. Single Node process only — for horizontal scale use Redis pub/sub.
 */
const buses = new Map<string, EventEmitter>();

function bus(projectId: string): EventEmitter {
  let b = buses.get(projectId);
  if (!b) {
    b = new EventEmitter();
    b.setMaxListeners(200);
    buses.set(projectId, b);
  }
  return b;
}

export type ProjectRealtimePayload = Record<string, unknown>;

export function emitProject(projectId: string, payload: ProjectRealtimePayload) {
  bus(projectId).emit("msg", payload);
}

export function subscribeProject(
  projectId: string,
  fn: (payload: ProjectRealtimePayload) => void,
): () => void {
  const b = bus(projectId);
  const handler = (p: ProjectRealtimePayload) => fn(p);
  b.on("msg", handler);
  return () => {
    b.off("msg", handler);
  };
}

/** Notify subscribers to refetch project data (tasks, analytics, etc.). */
export function broadcastProjectSync(
  projectId: string,
  meta?: { kind?: string; taskId?: string; actorUserId?: string },
) {
  emitProject(projectId, { type: "sync", ...meta });
}

/** 任务内聊天：客户端按 taskId 追加消息，无需整页同步 */
export function broadcastTaskChat(
  projectId: string,
  taskId: string,
  message: Record<string, unknown>,
) {
  emitProject(projectId, { type: "task_chat", taskId, message });
}

const PRESENCE_TTL_MS = 45_000;

export type PresenceViewer = {
  userId: string;
  name: string;
  taskId: string | null;
};

const presenceByProject = new Map<
  string,
  Map<string, { userId: string; name: string; taskId: string | null; lastSeen: number }>
>();

function prunePresence(projectId: string) {
  const m = presenceByProject.get(projectId);
  if (!m) return;
  const now = Date.now();
  for (const [uid, v] of Array.from(m.entries())) {
    if (now - v.lastSeen > PRESENCE_TTL_MS) m.delete(uid);
  }
}

export function listProjectPresence(projectId: string): PresenceViewer[] {
  prunePresence(projectId);
  const m = presenceByProject.get(projectId);
  if (!m) return [];
  return Array.from(m.values()).map(({ userId, name, taskId }) => ({
    userId,
    name,
    taskId,
  }));
}

export function presenceHeartbeat(
  projectId: string,
  userId: string,
  name: string,
  taskId: string | null,
) {
  if (!presenceByProject.has(projectId)) {
    presenceByProject.set(projectId, new Map());
  }
  const m = presenceByProject.get(projectId)!;
  m.set(userId, { userId, name, taskId, lastSeen: Date.now() });
  prunePresence(projectId);
  emitProject(projectId, {
    type: "presence",
    viewers: listProjectPresence(projectId),
  });
}
