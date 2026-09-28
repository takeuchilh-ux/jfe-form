import "server-only";
import { db } from "./supabase";
import { todayJst } from "./format";

/** 今日（日本時間）に開始したテストの回数 */
export async function attemptsToday(inspectorId: string): Promise<number> {
  const { count, error } = await db()
    .from("kensa_test_attempts")
    .select("id", { count: "exact", head: true })
    .eq("inspector_id", inspectorId)
    .gte("started_at", `${todayJst()}T00:00:00+09:00`);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
