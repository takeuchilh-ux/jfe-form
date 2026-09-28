import { handle, body, int, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

export const PATCH = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body(req);
  const patch = {
    car_rate_per_km: int(b.car_rate_per_km, -1),
    test_question_count: int(b.test_question_count, -1),
    test_pass_score: int(b.test_pass_score, -1),
  };
  if (patch.car_rate_per_km < 0 || patch.car_rate_per_km > 1000) bad("km 単価が不正です");
  if (patch.test_question_count < 1 || patch.test_question_count > 200) bad("出題数は 1〜200 にしてください");
  if (patch.test_pass_score < 0 || patch.test_pass_score > patch.test_question_count) bad("合格点は出題数以下にしてください");
  return must(await db().from("kensa_settings").update(patch).eq("id", 1).select().single());
});
