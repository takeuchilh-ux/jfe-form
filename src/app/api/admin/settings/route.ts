import { handle, body, int, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

export const PATCH = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body(req);
  const patch = {
    test_question_count: int(b.test_question_count, -1),
    test_pass_score: int(b.test_pass_score, -1),
    test_daily_limit: int(b.test_daily_limit, -1),
  };
  if (patch.test_question_count < 1 || patch.test_question_count > 200) bad("出題数は 1〜200 にしてください");
  if (patch.test_pass_score < 0 || patch.test_pass_score > patch.test_question_count) bad("合格点は出題数以下にしてください");
  if (patch.test_daily_limit < 1 || patch.test_daily_limit > 100) bad("1 日の受験回数は 1〜100 にしてください");
  return must(await db().from("kensa_settings").update(patch).eq("id", 1).select().single());
});
