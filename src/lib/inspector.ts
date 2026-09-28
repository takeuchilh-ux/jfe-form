import "server-only";
import { requireInspector, clearSession, HttpError } from "./session";
import { db } from "./supabase";

/** セッションの検査員を DB から取得（無効化・連携解除されていれば 401） */
export async function currentInspector() {
  const s = await requireInspector();
  const { data } = await db()
    .from("kensa_inspectors")
    .select("id,name,active,line_user_id")
    .eq("id", s.sub)
    .maybeSingle();
  if (!data || !data.active || !data.line_user_id) {
    await clearSession("inspector");
    throw new HttpError(401, "アカウントが無効です。管理者にお問い合わせください");
  }
  return data as { id: string; name: string; active: boolean; line_user_id: string };
}
