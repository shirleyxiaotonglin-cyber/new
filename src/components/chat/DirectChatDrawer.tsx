"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { MessageCircle, X } from "lucide-react";
import { sessionFetchInit } from "@/lib/fetch-session";

export type ChatPeer = { id: string; name: string };

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; name: string; avatarUrl: string | null };
};

export type DmPushPayload = {
  threadId: string;
  message: Msg;
};

/**
 * 私聊抽屉：与某项目成员 1v1，跨任务共用同一线程。
 * 实时推送由父级 useUserRealtime + dmPush 注入。
 */
export function DirectChatDrawer({
  open,
  onClose,
  projectId,
  peer,
  currentUserId,
  dmPush,
  onDmPushConsumed,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  peer: ChatPeer | null;
  currentUserId: string | null;
  dmPush: DmPushPayload | null;
  onDmPushConsumed: () => void;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  };

  const loadMessages = useCallback(async (tid: string) => {
    const res = await fetch(`/api/chat/dm/${tid}/messages?take=500`, sessionFetchInit);
    const j = (await res.json()) as { messages?: Msg[]; error?: string };
    if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "加载失败");
    setMessages(Array.isArray(j.messages) ? j.messages : []);
    scrollBottom();
  }, []);

  useEffect(() => {
    if (!open || !peer || !currentUserId || peer.id === currentUserId) {
      setThreadId(null);
      setMessages([]);
      setError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/chat/dm/open`, {
          ...sessionFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerUserId: peer.id }),
        });
        const j = (await res.json()) as { threadId?: string; error?: string };
        if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "无法打开会话");
        if (cancelled || !j.threadId) return;
        setThreadId(j.threadId);
        await loadMessages(j.threadId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "错误");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, peer?.id, projectId, currentUserId, peer, loadMessages]);

  useEffect(() => {
    if (!dmPush || dmPush.threadId !== threadId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === dmPush.message.id)) return prev;
      return [...prev, dmPush.message];
    });
    onDmPushConsumed();
    scrollBottom();
  }, [dmPush, threadId, onDmPushConsumed]);

  async function send() {
    const text = input.trim();
    if (!text || !threadId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/dm/${threadId}/messages`, {
        ...sessionFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const j = (await res.json()) as { message?: Msg; error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "发送失败");
      if (j.message) {
        setMessages((prev) => (prev.some((m) => m.id === j.message!.id) ? prev : [...prev, j.message!]));
      }
      setInput("");
      scrollBottom();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  if (!open || !peer) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/20 md:bg-black/10">
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-label="私聊"
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-red-600 px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
            <div>
              <p className="text-sm font-semibold">{peer.name}</p>
              <p className="text-[11px] text-red-100">私聊 · 与任务无关时也可继续此会话</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded p-1 text-red-100 hover:bg-red-700 hover:text-white"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {loading ? (
            <p className="text-center text-sm text-gray-500">加载消息…</p>
          ) : error ? (
            <p className="text-center text-sm text-red-600">{error}</p>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === currentUserId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-red-600 text-white" : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    {!mine ? (
                      <p className="mb-0.5 text-[10px] font-medium text-gray-500">{m.sender.name}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p
                      className={`mt-1 text-[10px] ${mine ? "text-red-100" : "text-gray-400"}`}
                    >
                      {format(new Date(m.createdAt), "MM-dd HH:mm")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 p-3">
          <div className="flex gap-2">
            <textarea
              className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm"
              placeholder="输入消息…"
              rows={2}
              value={input}
              disabled={!threadId || sending || !!error}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              disabled={!threadId || sending || !input.trim()}
              className="shrink-0 self-end rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              onClick={() => void send()}
            >
              {sending ? "…" : "发送"}
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="hidden flex-1 md:block"
        aria-label="关闭背景"
        onClick={onClose}
      />
    </div>
  );
}
