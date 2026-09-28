import { handle, body, str, bad } from "@/lib/api";
import { setSession, HttpError } from "@/lib/session";
import { verifyIdToken } from "@/lib/line";
import { db } from "@/lib/supabase";

/** LIFF の ID トークンでログイン。未連携なら needLink を返す */
export const POST = handle(async (req: Request) => {
  const idToken = str((await body(req)).idToken, 4000);
  if (!idToken) bad("idToken がありません");
  const line = await verifyIdToken(idToken);
  const { data } = await db().from("kensa_inspectors").select("id,name,active").eq("line_user_id", line.userId).maybeSingle();
  if (!data) return { needLink: true, lineName: line.name };
  if (!data.active) throw new HttpError(403, "アカウントが無効です。管理者にお問い合わせください");
  await setSession({ kind: "inspector", sub: data.id, name: data.name });
  if (line.name) await db().from("kensa_inspectors").update({ line_display_name: line.name }).eq("id", data.id);
  return { ok: true, name: data.name };
});
