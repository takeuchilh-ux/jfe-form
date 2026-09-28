import { handle } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { getSettings } from "@/lib/data";
import { db } from "@/lib/supabase";

export const GET = handle(async () => {
  const me = await currentInspector({ allowPending: true });
  const s = await getSettings();
  const { data } = await db().from("kensa_inspectors").select("address").eq("id", me.id).single();
  return {
    id: me.id,
    name: me.name,
    approved: !!me.approved_at,
    address: data?.address ?? "",
    routeSearch: !!process.env.GOOGLE_MAPS_API_KEY,
    testQuestionCount: s.test_question_count,
    testPassScore: s.test_pass_score,
    testDailyLimit: s.test_daily_limit,
  };
});
