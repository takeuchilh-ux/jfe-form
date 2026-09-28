import { handle, body, str, bad } from "@/lib/api";
import { setSession, HttpError } from "@/lib/session";
import { verifyIdToken } from "@/lib/line";
import { db, must } from "@/lib/supabase";
import { fullName, parseProfile } from "@/lib/profile";

/** 初回の基本情報登録（LINE アカウントと紐づけて検査員を作成。管理者の承認待ちになる） */
export const POST = handle(async (req: Request) => {
  const b = await body<{ idToken?: unknown; profile?: Record<string, unknown> }>(req);
  const idToken = str(b.idToken, 4000);
  if (!idToken) bad("idToken がありません");
  const line = await verifyIdToken(idToken);
  const p = parseProfile(b.profile ?? {});
  if (typeof p === "string") bad(p);

  const { data: exists } = await db().from("kensa_inspectors").select("id").eq("line_user_id", line.userId).maybeSingle();
  if (exists) throw new HttpError(409, "この LINE アカウントは既に登録済みです");

  const row = must(
    await db()
      .from("kensa_inspectors")
      .insert({
        ...p,
        name: fullName(p),
        line_user_id: line.userId,
        line_display_name: line.name,
        linked_at: new Date().toISOString(),
      })
      .select("id,name")
      .single(),
  );
  await setSession({ kind: "inspector", sub: row.id, name: row.name });
  return { ok: true };
});
