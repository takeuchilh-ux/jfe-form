import bcrypt from "bcryptjs";
import { handle, body, str } from "@/lib/api";
import { HttpError, setSession } from "@/lib/session";
import { db } from "@/lib/supabase";

export const POST = handle(async (req: Request) => {
  const b = await body(req);
  const email = str(b.email).toLowerCase();
  const password = typeof b.password === "string" ? b.password : "";
  const { data } = await db().from("kensa_admins").select("id,name,password_hash").eq("email", email).maybeSingle();
  // ユーザーが存在しない場合もハッシュ比較を行い応答時間を揃える
  const hash = data?.password_hash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const ok = await bcrypt.compare(password, hash);
  if (!data || !ok) throw new HttpError(401, "メールアドレスまたはパスワードが違います");
  await setSession({ kind: "admin", sub: data.id, name: data.name || email });
  return { ok: true };
});
