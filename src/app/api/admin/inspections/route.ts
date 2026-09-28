import { handle, body, str, int, isDate, isUuid, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

type Input = { store_id?: unknown; inspection_date?: unknown; time_slot?: unknown; required_count?: unknown; notes?: unknown };

/** 検査を登録（items 配列で一括登録可） */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ period_id?: unknown; items?: Input[] }>(req);
  if (!isUuid(b.period_id)) bad("period_id が不正です");
  const period = must(await db().from("kensa_periods").select("year_month").eq("id", b.period_id).single());
  const items = b.items ?? [];
  if (!items.length) bad("登録する検査がありません");
  if (items.length > 500) bad("一度に登録できるのは 500 件までです");
  const rows = items.map((it, i) => {
    if (!isUuid(it.store_id)) bad(`${i + 1} 行目：店舗を選択してください`);
    if (!isDate(it.inspection_date)) bad(`${i + 1} 行目：日付が不正です`);
    if (!it.inspection_date.startsWith(period.year_month)) bad(`${i + 1} 行目：${period.year_month} の日付を指定してください`);
    return {
      period_id: b.period_id as string,
      store_id: it.store_id,
      inspection_date: it.inspection_date,
      time_slot: str(it.time_slot, 50),
      required_count: Math.min(10, Math.max(1, int(it.required_count, 1))),
      notes: str(it.notes, 1000),
    };
  });
  must(await db().from("kensa_inspections").insert(rows));
  return { count: rows.length };
});
