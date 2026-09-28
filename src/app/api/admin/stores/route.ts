import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

function storeFields(b: Record<string, unknown>) {
  return {
    name: str(b.name, 200),
    group_name: str(b.group_name, 200),
    area: str(b.area, 100),
    address: str(b.address, 300),
    notes: str(b.notes, 1000),
  };
}

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const f = storeFields(await body(req));
  if (!f.name) bad("店舗名を入力してください");
  return must(await db().from("kensa_stores").insert(f).select().single());
});
