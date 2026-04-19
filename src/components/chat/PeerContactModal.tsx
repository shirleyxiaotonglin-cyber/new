"use client";

import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";

export type PeerProfile = {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
};

/**
 * 任务内点击负责人 / 协助人：展示基本信息，并跳转消息中心发私信（记录存在 DirectMessage）。
 */
export function PeerContactModal({
  open,
  onClose,
  user,
  orgId,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  user: PeerProfile | null;
  orgId: string;
  projectId: string;
}) {
  const router = useRouter();
  if (!open || !user) return null;

  function goMessages() {
    if (!user) return;
    const q = new URLSearchParams({ peer: user.id, project: projectId });
    router.push(`/org/${orgId}/messages?${q.toString()}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭背景"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="peer-contact-title"
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-red-100 text-xl font-semibold text-red-700">
            {user.avatarUrl ?
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            : user.name.slice(0, 1).toUpperCase()}
          </div>
          <h3 id="peer-contact-title" className="mt-3 pr-8 text-lg font-semibold text-gray-900">
            {user.name}
          </h3>
          {user.email ?
            <p className="mt-1 max-w-full break-all text-sm text-gray-500">{user.email}</p>
          : null}
          <p className="mt-3 text-xs leading-relaxed text-gray-400">
            私信记录保存在「消息中心」，与任务详情中的讨论（任务讨论）相互独立。
          </p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={goMessages}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-red-700"
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
            前往消息中心发送消息
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-1 text-sm text-gray-500 hover:text-gray-800"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
