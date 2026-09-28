import "server-only";
import { requireInspector, clearSession, HttpError } from "./session";
import { db } from "./supabase";

type Current = { id: string; name: string; active: boolean; approved_at: string | null; line_user_id: string };

/**
 * セッションの検査員を DB から取得。
 * 無効化・LINE 連携解除されていれば 401、管理者の承認前は 403（allowPending のときは許可）。
 */
export async function currentInspector(opts: { allowPending?: boolean } = {}): Promise<Current> {
  const s = await requireInspector();
  const { data } = await db()
    .from("kensa_inspectors")
    .select("id,name,active,approved_at,line_user_id")
    .eq("id", s.sub)
    .maybeSingle();
  if (!data || !data.active || !data.line_user_id) {
    await clearSession("inspector");
    throw new HttpError(401, "アカウントが無効です。管理者にお問い合わせください");
  }
  if (!data.approved_at && !opts.allowPending) throw new HttpError(403, "管理者の承認をお待ちください");
  return data as Current;
}
