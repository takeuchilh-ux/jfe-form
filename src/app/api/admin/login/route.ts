import bcrypt from "bcryptjs";
import { handle, body, str } from "@/lib/api";
import { HttpError, setSession } from "@/lib/session";
import { db, maybe } from "@/lib/supabase";

export const POST = handle(async (req: Request) => {
  const b = await body(req);
  const email = str(b.email).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  // DB 接続エラーは「パスワード違い」と区別して表示する
  const res = await db().from("kensa_admins").select("id,name,password_hash").eq("email", email).maybeSingle();
  if (res.error) {
    console.error("admin login db error", res.error);
    throw new HttpError(500, `データベースに接続できません（Vercel の SUPABASE_SERVICE_ROLE_KEY を確認してください）: ${res.error.message}`);
  }
  const data = maybe(res);
  // ユーザーが存在しない場合もハッシュ比較を行い応答時間を揃える
  const hash = data?.password_hash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);
  if (!data || !ok) throw new HttpError(401, "メールアドレスまたはパスワードが違います");
  await setSession({ kind: "admin", sub: data.id, name: data.name || email });
  return { ok: true };
});
