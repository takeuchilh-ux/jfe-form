import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 型生成は行わず、各クエリ側で結果の型を明示する
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", "public", any, any>;
let client: Client | null = null;

/** サーバー専用の Supabase クライアント（service_role）。RLS をバイパスするためブラウザへ渡さないこと。 */
export function db(): Client {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

export const RECEIPT_BUCKET = "kensa-receipts";

/** Supabase のエラーを例外に変換してデータを返す（データなしもエラー） */
export function must<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R["data"]> {
  if (res.error) throw new Error(res.error.message);
  if (res.data === null || res.data === undefined) throw new Error("データが見つかりません");
  return res.data as NonNullable<R["data"]>;
}

/** maybeSingle() 用：該当なしは null を返す */
export function maybe<R extends { data: unknown; error: { message: string } | null }>(res: R): R["data"] | null {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
