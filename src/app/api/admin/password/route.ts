import bcrypt from "bcryptjs";
import { handle, body, bad } from "@/lib/api";
import { requireAdmin, HttpError } from "@/lib/session";
import { db, must } from "@/lib/supabase";

/** ログイン中の管理者のパスワード変更 */
export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin();
  const b = await body(req);
  const current = typeof b.current === "string" ? b.current : "";
  const next = typeof b.next === "string" ? b.next : "";
  if (next.length < 10) bad("新しいパスワードは 10 文字以上にしてください");
  const row = must(await db().from("kensa_admins").select("password_hash").eq("id", admin.sub).single());
  if (!(await bcrypt.compare(current, row.password_hash))) throw new HttpError(400, "現在のパスワードが違います");
  const password_hash = await bcrypt.hash(next, 10);
  must(await db().from("kensa_admins").update({ password_hash }).eq("id", admin.sub).select("id"));
});
