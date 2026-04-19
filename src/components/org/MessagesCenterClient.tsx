"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { useUserRealtime, type DirectMessageEvent } from "@/hooks/useUserRealtime";
import { cn } from "@/lib/cn";

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
};

type DmThread = {
  threadId: string;
  peer: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
  lastMessage: { body: string; createdAt: string } | null;
};

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; name: string; avatarUrl: string | null };
};

export function MessagesCenterClient({
  orgId,
  currentUserId,
  initialNotifications,
}: {
  orgId: string;
  currentUserId: string;
  initialNotifications: NotifRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const peerFromUrl = searchParams.get("peer");
  const [tab, setTab] = useState<"dm" | "notifications">("dm");
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<DmThread["peer"] | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const peerHandledRef = useRef<string | null>(null);

  const scrollBottom = () => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  };

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/dm-threads`, { credentials: "include" });
      const j = (await res.json()) as { threads?: DmThread[]; error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "加载会话失败");
      setThreads(Array.isArray(j.threads) ? j.threads : []);
    } catch {
      setThreads([]);
    } finally {
      setThreadsLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const loadMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true);
    setMsgError(null);
    try {
      const res = await fetch(`/api/chat/dm/${threadId}/messages`, { credentials: "include" });
      const j = (await res.json()) as { messages?: Msg[]; error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "加载消息失败");
      setMessages(Array.isArray(j.messages) ? j.messages : []);
      scrollBottom();
    } catch (e) {
      setMsgError(e instanceof Error ? e.message : "加载失败");
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedThreadId);
  }, [selectedThreadId, loadMessages]);

  /** 从任务页 ?peer= 打开会话 */
  useEffect(() => {
    if (!peerFromUrl || peerHandledRef.current === peerFromUrl) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/orgs/${orgId}/chat/dm/open`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerUserId: peerFromUrl }),
      });
      const j = (await res.json()) as {
        threadId?: string;
        peer?: DmThread["peer"];
        error?: string;
      };
      if (cancelled || !res.ok || !j.threadId) return;
      peerHandledRef.current = peerFromUrl;
      setTab("dm");
      setSelectedThreadId(j.threadId);
      if (j.peer) setSelectedPeer(j.peer);
      void loadThreads();
      router.replace(`/org/${orgId}/messages`, { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, peerFromUrl, router, loadThreads]);

  useUserRealtime(true, (ev) => {
    if ((ev as DirectMessageEvent).type !== "direct_message") return;
    const d = ev as DirectMessageEvent;
    if (d.threadId !== selectedThreadId) {
      void loadThreads();
      return;
    }
    setMessages((prev) => {
      if (prev.some((m) => m.id === d.message.id)) return prev;
      return [...prev, d.message];
    });
    scrollBottom();
  });

  async function sendDm() {
    const text = input.trim();
    if (!text || !selectedThreadId || sending) return;
    setSending(true);
    setMsgError(null);
    try {
      const res = await fetch(`/api/chat/dm/${selectedThreadId}/messages`, {
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
      scrollBottom();
      void loadThreads();
    } catch (e) {
      setMsgError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  function selectThread(t: DmThread) {
    setSelectedThreadId(t.threadId);
    setSelectedPeer(t.peer);
  }

  return (
    <div className="mx-auto mt-6 max-w-6xl">
      <div className="flex gap-2 border-b border-gray-200 pb-4">
        <button
          type="button"
          onClick={() => setTab("dm")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium",
            tab === "dm" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
          )}
        >
          私信
        </button>
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium",
            tab === "notifications" ?
              "bg-red-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200",
          )}
        >
          通知与提醒
        </button>
      </div>

      {tab === "notifications" ?
        <ul className="mt-6 space-y-3">
          {initialNotifications.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border px-4 py-3 ${
                n.read ? "border-gray-100 bg-gray-50" : "border-red-100 bg-red-50/50"
              }`}
            >
              <p className="font-medium text-gray-900">{n.title}</p>
              {n.body ?
                <p className="mt-1 text-sm text-gray-600">{n.body}</p>
              : null}
              <p className="mt-2 text-xs text-gray-400">
                {format(new Date(n.createdAt), "yyyy-MM-dd HH:mm")}
              </p>
            </li>
          ))}
          {initialNotifications.length === 0 ?
            <p className="mt-12 text-center text-gray-500">暂无通知。</p>
          : null}
        </ul>
      : (
        <div className="mt-4 flex min-h-[420px] flex-col gap-4 rounded-2xl border border-gray-200 bg-white shadow-sm lg:flex-row lg:gap-0">
          <aside className="flex w-full flex-col border-b border-gray-200 lg:w-72 lg:border-b-0 lg:border-r">
            <p className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-500">
              本会话列表（对方须为本组织成员）
            </p>
            <div className="max-h-[280px] overflow-y-auto lg:max-h-[480px]">
              {threadsLoading ?
                <p className="px-3 py-6 text-center text-sm text-gray-500">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-red-600" />
                </p>
              : threads.length === 0 ?
                <p className="px-3 py-6 text-center text-sm text-gray-500">暂无私信，可从项目中联系成员发起。</p>
              : (
                threads.map((t) => (
                  <button
                    key={t.threadId}
                    type="button"
                    onClick={() => selectThread(t)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 border-b border-gray-50 px-3 py-2.5 text-left text-sm transition-colors hover:bg-red-50/60",
                      selectedThreadId === t.threadId ? "bg-red-50" : "",
                    )}
                  >
                    <span className="font-medium text-gray-900">{t.peer.name}</span>
                    <span className="truncate text-xs text-gray-500">
                      {t.lastMessage?.body ?? "（暂无消息）"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-[320px] min-w-0 flex-1 flex-col lg:min-h-[480px]">
            {!selectedThreadId ?
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-gray-500">
                <MessageCircle className="h-10 w-10 text-gray-300" aria-hidden />
                <p>选择左侧会话，或从项目任务中点击「前往消息中心发送消息」。</p>
              </div>
            : (
              <>
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="font-semibold text-gray-900">{selectedPeer?.name ?? "会话"}</p>
                  {selectedPeer?.email ?
                    <p className="text-xs text-gray-500">{selectedPeer.email}</p>
                  : null}
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
                  {messagesLoading ?
                    <p className="text-center text-sm text-gray-500">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-red-600" />
                    </p>
                  : msgError ?
                    <p className="text-center text-sm text-red-600">{msgError}</p>
                  : (
                    messages.map((m) => {
                      const mine = m.senderId === currentUserId;
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                              mine ? "bg-red-600 text-white" : "bg-gray-100 text-gray-900"
                            }`}
                          >
                            {!mine ?
                              <p className="mb-0.5 text-[10px] font-medium text-gray-500">{m.sender.name}</p>
                            : null}
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
                      disabled={sending || !!msgError}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendDm();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={sending || !input.trim()}
                      className="inline-flex shrink-0 items-center gap-1 self-end rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      onClick={() => void sendDm()}
                    >
                      {sending ?
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      : <Send className="h-4 w-4" aria-hidden />}
                      发送
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
