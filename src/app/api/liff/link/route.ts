import { handle, body, str, bad } from "@/lib/api";
import { setSession, HttpError } from "@/lib/session";
import { verifyIdToken } from "@/lib/line";
import { db } from "@/lib/supabase";

/** 管理者から伝えられた連携コードで LINE アカウントと検査員を紐づける */
export const POST = handle(async (req: Request) => {
  const b = await body(req);
  const idToken = str(b.idToken, 4000);
  const code = str(b.code, 20).toUpperCase().replace(/\s/g, "");
  if (!idToken || !code) bad("連携コードを入力してください");
  const line = await verifyIdToken(idToken);

  const { data: already } = await db().from("kensa_inspectors").select("id").eq("line_user_id", line.userId).maybeSingle();
  if (already) throw new HttpError(409, "この LINE アカウントは既に連携済みです");

  const { data } = await db()
    .from("kensa_inspectors")
    .update({ line_user_id: line.userId, line_display_name: line.name, linked_at: new Date().toISOString() })
    .eq("link_code", code)
    .eq("active", true)
    .is("line_user_id", null)
    .select("id,name")
    .maybeSingle();
  if (!data) throw new HttpError(400, "連携コードが正しくないか、既に使用されています");
  await setSession({ kind: "inspector", sub: data.id, name: data.name });
  return { ok: true, name: data.name };
});
