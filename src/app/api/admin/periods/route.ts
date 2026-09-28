import { handle, body, isMonth, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

/** 指定月のスケジュール枠を作成（既にあればそれを返す） */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const { month } = await body(req);
  if (!isMonth(month)) bad("月の形式が不正です");
  return must(
    await db().from("kensa_periods").upsert({ year_month: month }, { onConflict: "year_month", ignoreDuplicates: false }).select().single(),
  );
});
