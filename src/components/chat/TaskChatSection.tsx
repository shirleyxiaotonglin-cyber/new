"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { MessagesSquare } from "lucide-react";

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; name: string; avatarUrl: string | null };
};

type RemotePayload = {
  taskId: string;
  message: Msg;
} | null;

/**
 * 任务内讨论：订阅项目 SSE 的 task_chat 事件，与接口 POST 对齐。
 */
export function TaskChatSection({
  taskId,
  currentUserId,
  remotePayload,
  onRemoteConsumed,
}: {
  taskId: string;
  currentUserId: string | null;
  remotePayload: RemotePayload;
  onRemoteConsumed: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/chat`, { credentials: "include" });
      const j = (await res.json()) as { messages?: Msg[]; error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "加载失败");
      setMessages(Array.isArray(j.messages) ? j.messages : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "错误");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!remotePayload || remotePayload.taskId !== taskId) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === remotePayload.message.id)) return prev;
      return [...prev, remotePayload.message];
    });
    onRemoteConsumed();
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, [remotePayload, taskId, onRemoteConsumed]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const j = (await res.json()) as { message?: Msg; error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "发送失败");
      if (j.message) {
        setMessages((prev) => (prev.some((m) => m.id === j.message!.id) ? prev : [...prev, j.message!]));
      }
      setInput("");
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-700">
        <MessagesSquare className="h-4 w-4 text-red-600" aria-hidden />
        任务讨论
      </div>
      <p className="mb-2 text-[11px] leading-snug text-gray-500">
        项目成员均可参与；与私聊不同，消息仅绑定本任务并在项目内实时同步。
      </p>

      <div className="mb-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-gray-200 bg-white px-2 py-2">
        {loading ? (
          <p className="text-center text-xs text-gray-500">加载…</p>
        ) : error ? (
          <p className="text-center text-xs text-red-600">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-gray-400">暂无讨论，发送第一条</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`text-xs ${mine ? "text-right" : "text-left"}`}>
                <span className="font-medium text-gray-600">{m.sender.name}</span>
                <div
                  className={`mt-0.5 inline-block max-w-full rounded-lg px-2 py-1.5 text-left ${
                    mine ? "bg-red-600 text-white" : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <span className="whitespace-pre-wrap break-words">{m.body}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-gray-400">
                  {format(new Date(m.createdAt), "MM-dd HH:mm")}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <textarea
          className="min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900"
          rows={2}
          placeholder="任务相关讨论…"
          value={input}
          disabled={sending}
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
          disabled={sending || !input.trim()}
          className="shrink-0 self-end rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          onClick={() => void send()}
        >
          {sending ? "…" : "发送"}
        </button>
      </div>
    </div>
  );
}
