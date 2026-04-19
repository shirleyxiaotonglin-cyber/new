"use client";

import { useEffect, useRef, useState } from "react";

export type PresenceViewer = {
  userId: string;
  name: string;
  taskId: string | null;
};

/**
 * SSE subscription + presence heartbeat. Refetches project when server broadcasts sync.
 */
export function useProjectRealtime(
  projectId: string,
  options: {
    onSync: (opts?: { silent?: boolean }) => void | Promise<void>;
    viewingTaskId?: string | null;
    enabled?: boolean;
    /** 任务内聊天：收到新消息时回调（不必整表刷新） */
    onTaskChat?: (payload: {
      taskId: string;
      message: {
        id: string;
        body: string;
        createdAt: string;
        senderId: string;
        sender: { id: string; name: string; avatarUrl: string | null };
      };
    }) => void;
  },
) {
  const { onSync, viewingTaskId = null, enabled = true, onTaskChat } = options;
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const onTaskChatRef = useRef(onTaskChat);
  onTaskChatRef.current = onTaskChat;
  const taskRef = useRef(viewingTaskId);
  taskRef.current = viewingTaskId;

  const [presence, setPresence] = useState<PresenceViewer[]>([]);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json()) as { user?: { id?: string } };
        if (!cancelled && j.user?.id) setMeId(j.user.id);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !projectId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSync = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void onSyncRef.current({ silent: true });
      }, 160);
    };

    const es = new EventSource(`/api/projects/${projectId}/stream`);

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as Record<string, unknown>;
        if (data.type === "ping" || data.type === "connected") return;
        if (data.type === "presence") {
          const v = data.viewers;
          setPresence(Array.isArray(v) ? (v as PresenceViewer[]) : []);
          return;
        }
        if (data.type === "task_chat") {
          const taskId = typeof data.taskId === "string" ? data.taskId : "";
          const message = data.message;
          if (
            taskId &&
            message &&
            typeof message === "object" &&
            onTaskChatRef.current
          ) {
            onTaskChatRef.current({
              taskId,
              message: message as {
                id: string;
                body: string;
                createdAt: string;
                senderId: string;
                sender: { id: string; name: string; avatarUrl: string | null };
              },
            });
          }
          return;
        }
        if (data.type === "sync") {
          scheduleSync();
        }
      } catch {
        /* ignore malformed */
      }
    };

    const pingPresence = () => {
      void fetch(`/api/projects/${projectId}/presence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taskId: taskRef.current }),
      }).catch(() => {});
    };
    pingPresence();
    const hb = setInterval(pingPresence, 25_000);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        pingPresence();
        void onSyncRef.current({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(hb);
      clearTimeout(debounceTimer);
      es.close();
    };
  }, [projectId, enabled]);

  const othersPresence = meId
    ? presence.filter((p) => p.userId !== meId)
    : presence;

  return { presence, othersPresence, meId };
}
