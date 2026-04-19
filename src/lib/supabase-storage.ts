import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 服务端使用 Service Role 访问 Storage（仅 API Route 内调用）。
 * 未配置时返回 null，上传接口应返回明确提示。
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getDeliverablesBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "deliverables";
}
