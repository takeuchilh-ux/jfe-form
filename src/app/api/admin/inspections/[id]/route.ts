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
  if ("trainee_slots" in b) patch.trainee_slots = Math.min(5, Math.max(0, int(b.trainee_slots, 1)));
  // 検査員による日時変更を確認済みにする
  if (b.change_seen === true) patch.change_seen = true;
  if ("required_count" in b) patch.required_count = Math.min(10, Math.max(1, int(b.required_count, 1)));
  if ("status" in b) {
    if (!["open", "completed", "cancelled"].includes(String(b.status))) bad("状態が不正です");
    patch.status = b.status;
  }
  const cur = must(await db().from("kensa_inspections").select("inspection_date,time_slot").eq("id", id).single());
  const row = must(await db().from("kensa_inspections").update(patch).eq("id", id).select().single());
  // 日時が変わったら、新しい日付の前日に改めてリマインドする
  if (row.inspection_date !== cur.inspection_date || row.time_slot !== cur.time_slot) {
    must(await db().from("kensa_assignments").update({ reminded_at: null }).eq("inspection_id", id).select("id"));
  }
  return row;
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const { count } = await db().from("kensa_expense_inspections").select("expense_id", { count: "exact", head: true }).eq("inspection_id", id);
  if (count) bad("交通費申請が紐づいているため削除できません。「中止」にしてください");
  must(await db().from("kensa_inspections").delete().eq("id", id).select("id"));
});
