import { handle } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { getSettings } from "@/lib/data";

export const GET = handle(async () => {
  const me = await currentInspector();
  const s = await getSettings();
  return { id: me.id, name: me.name, carRatePerKm: s.car_rate_per_km, testQuestionCount: s.test_question_count, testPassScore: s.test_pass_score };
});
