import { handle, body, str, int, isDate, isUuid, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  if ("store_id" in b) {
    if (!isUuid(b.store_id)) bad("店舗が不正です");
    patch.store_id = b.store_id;
  }
  if ("inspection_date" in b) {
    if (!isDate(b.inspection_date)) bad("日付が不正です");
    patch.inspection_date = b.inspection_date;
  }
  if ("time_slot" in b) patch.time_slot = str(b.time_slot, 50);
  if ("notes" in b) patch.notes = str(b.notes, 1000);
  if ("required_count" in b) patch.required_count = Math.min(10, Math.max(1, int(b.required_count, 1)));
  if ("status" in b) {
    if (!["open", "completed", "cancelled"].includes(String(b.status))) bad("状態が不正です");
    patch.status = b.status;
  }
  return must(await db().from("kensa_inspections").update(patch).eq("id", id).select().single());
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const { count } = await db().from("kensa_expense_inspections").select("expense_id", { count: "exact", head: true }).eq("inspection_id", id);
  if (count) bad("交通費申請が紐づいているため削除できません。「中止」にしてください");
  must(await db().from("kensa_inspections").delete().eq("id", id).select("id"));
});
