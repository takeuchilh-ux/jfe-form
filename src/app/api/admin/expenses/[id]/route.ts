import { handle, body, str, isDate, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must, RECEIPT_BUCKET } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/** 状態・コメントの変更と、内容の修正（利用日・距離・駐車場代・金額・備考） */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  if ("status" in b) {
    if (!["submitted", "approved", "rejected", "paid"].includes(String(b.status))) bad("状態が不正です");
    patch.status = b.status;
  }
  if ("admin_comment" in b) patch.admin_comment = str(b.admin_comment, 1000);
  if ("use_date" in b) {
    if (!isDate(b.use_date)) bad("利用日が不正です");
    patch.use_date = b.use_date;
  }
  if ("note" in b) patch.note = str(b.note, 500);
  if ("distance_km" in b) {
    const d = Number(b.distance_km);
    if (!Number.isFinite(d) || d < 0 || d > 2000) bad("距離が不正です");
    patch.distance_km = Math.round(d * 10) / 10;
  }
  if ("parking_fee" in b) {
    const p = Math.round(Number(b.parking_fee));
    if (!Number.isFinite(p) || p < 0 || p > 100000) bad("駐車場代が不正です");
    patch.parking_fee = p;
  }
  if ("amount" in b) {
    const a = Math.round(Number(b.amount));
    if (!Number.isFinite(a) || a < 0 || a > 1000000) bad("金額が不正です");
    patch.amount = a;
  }
  // 車は金額＝駐車場代
  if ("parking_fee" in patch && !("amount" in patch)) {
    const cur = must(await db().from("kensa_expenses").select("transport").eq("id", id).single());
    if (cur.transport === "car") patch.amount = patch.parking_fee;
  }
  return must(await db().from("kensa_expenses").update(patch).eq("id", id).select().single());
});

/** 交通費申請を削除（レシート画像も削除） */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const row = must(await db().from("kensa_expenses").select("receipt_paths").eq("id", id).single());
  must(await db().from("kensa_expenses").delete().eq("id", id).select("id"));
  const paths = (row.receipt_paths ?? []) as string[];
  if (paths.length) await db().storage.from(RECEIPT_BUCKET).remove(paths);
});
