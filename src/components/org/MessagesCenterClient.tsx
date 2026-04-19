"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { FileUp, Loader2, MessageCircle, Paperclip, Send } from "lucide-react";
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

function formatDmFileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  file?: {
    id: string;
    name: string;
    mimeType: string;
    size: number;
    url: string | null;
  } | null;
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
  const projectIdFromUrl = searchParams.get("projectId");
  const [tab, setTab] = useState<"dm" | "notifications">("dm");
  const [threads, setThreads] = useState<DmThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<DmThread["peer"] | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  /** 从任务页 ?peer= 打开会话；若带 projectId= 则走项目级 open（与组织成员无交集时也可用） */
  useEffect(() => {
    if (!peerFromUrl) return;
    const handleKey = `${peerFromUrl}:${projectIdFromUrl ?? ""}`;
    if (peerHandledRef.current === handleKey) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        projectIdFromUrl ?
          `/api/projects/${projectIdFromUrl}/chat/dm/open`
        : `/api/orgs/${orgId}/chat/dm/open`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ peerUserId: peerFromUrl }),
        },
      );
      const j = (await res.json()) as {
        threadId?: string;
        peer?: DmThread["peer"];
        error?: string;
      };
      if (cancelled || !res.ok || !j.threadId) return;
      peerHandledRef.current = handleKey;
      setTab("dm");
      setSelectedThreadId(j.threadId);
      if (j.peer) setSelectedPeer(j.peer);
      void loadThreads();
      router.replace(`/org/${orgId}/messages`, { scroll: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, peerFromUrl, projectIdFromUrl, router, loadThreads]);

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
    if ((!text && !pendingFile) || !selectedThreadId || sending) return;
    setSending(true);
    setMsgError(null);
    try {
      let res: Response;
      if (pendingFile) {
        const fd = new FormData();
        fd.append("orgId", orgId);
        fd.append("file", pendingFile);
        if (text) fd.append("body", text);
        res = await fetch(`/api/chat/dm/${selectedThreadId}/messages`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
      } else {
        res = await fetch(`/api/chat/dm/${selectedThreadId}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
      }
      const j = (await res.json()) as { message?: Msg; error?: string };
      if (!res.ok) throw new Error(typeof j.error === "string" ? j.error : "发送失败");
      if (j.message) {
        setMessages((prev) => (prev.some((m) => m.id === j.message!.id) ? prev : [...prev, j.message!]));
      }
      setInput("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
              联系人 · 最近会话
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
                <p>选择左侧会话，或在项目任务详情中点击「私聊」跳转至此。</p>
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
                            {m.file ?
                              <div
                                className={`mt-2 rounded-lg border px-2 py-1.5 text-xs ${
                                  mine ? "border-red-200 bg-red-500/30" : "border-gray-200 bg-white"
                                }`}
                              >
                                <p className="flex items-center gap-1 font-medium">
                                  <FileUp className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                  <span className="truncate">{m.file.name}</span>
                                </p>
                                <p className={`mt-0.5 text-[10px] ${mine ? "text-red-100" : "text-gray-500"}`}>
                                  {formatDmFileSize(m.file.size)} · {m.file.mimeType}
                                </p>
                                {m.file.url ?
                                  <a
                                    href={m.file.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`mt-1 inline-block font-medium underline ${
                                      mine ? "text-white" : "text-red-700"
                                    }`}
                                  >
                                    下载 / 打开
                                  </a>
                                : (
                                  <p className={`mt-1 text-[10px] ${mine ? "text-red-100" : "text-gray-400"}`}>
                                    暂无法生成下载链接（请检查对象存储配置）
                                  </p>
                                )}
                              </div>
                            : null}
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
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="sr-only"
                    accept="image/*,video/*,application/pdf,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.json,.js,.ts,.tsx,.css,.html"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      setPendingFile(f ?? null);
                    }}
                  />
                  {pendingFile ?
                    <p className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
                      <span className="min-w-0 truncate">
                        <Paperclip className="mr-1 inline h-3.5 w-3.5 text-gray-500" aria-hidden />
                        {pendingFile.name}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-red-600 hover:underline"
                        onClick={() => {
                          setPendingFile(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                      >
                        移除
                      </button>
                    </p>
                  : null}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={sending || !!msgError}
                      className="inline-flex shrink-0 items-center self-end rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      title="添加附件"
                      aria-label="添加附件"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" aria-hidden />
                    </button>
                    <textarea
                      className="min-h-[44px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm"
                      placeholder={pendingFile ? "可选：为附件添加说明…" : "输入消息…"}
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
                      disabled={sending || (!input.trim() && !pendingFile)}
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
