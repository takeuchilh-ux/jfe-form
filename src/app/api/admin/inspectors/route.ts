import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body(req);
  const row = {
    name: str(b.name, 100),
    name_kana: str(b.name_kana, 100),
    phone: str(b.phone, 50),
    email: str(b.email, 200),
    area: str(b.area, 100),
    notes: str(b.notes, 1000),
  };
  if (!row.name) bad("氏名を入力してください");
  return must(await db().from("kensa_inspectors").insert(row).select().single());
});
