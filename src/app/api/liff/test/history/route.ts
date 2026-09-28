import { handle } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must } from "@/lib/supabase";
import { getSettings } from "@/lib/data";
import { attemptsToday } from "@/lib/testing";

export const GET = handle(async () => {
  const me = await currentInspector();
  const [rows, used, settings] = await Promise.all([
    db()
      .from("kensa_test_attempts")
      .select("id,score,total,passed,submitted_at")
      .eq("inspector_id", me.id)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(20),
    attemptsToday(me.id),
    getSettings(),
  ]);
  return { attempts: must(rows), usedToday: used, dailyLimit: settings.test_daily_limit };
});
