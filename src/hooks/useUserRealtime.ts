"use client";

import { useEffect, useRef } from "react";

export type DirectMessageEvent = {
  type: "direct_message";
  threadId: string;
  message: {
    id: string;
    body: string;
    createdAt: string;
    senderId: string;
    sender: { id: string; name: string; avatarUrl: string | null };
  };
};

/**
 * 用户级 SSE（私聊推送）。应在应用内只挂载一处，避免重复连接。
 */
export function useUserRealtime(
  enabled: boolean,
  onEvent: (ev: DirectMessageEvent | Record<string, unknown>) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource("/api/me/stream");

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as Record<string, unknown>;
        if (data.type === "ping" || data.type === "connected") return;
        onEventRef.current(data);
      } catch {
        /* ignore */
      }
    };

    return () => {
      es.close();
    };
  }, [enabled]);
}
