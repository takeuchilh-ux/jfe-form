import { handle } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must } from "@/lib/supabase";

export const GET = handle(async () => {
  const me = await currentInspector();
  const rows = must(
    await db()
      .from("kensa_test_attempts")
      .select("id,score,total,passed,submitted_at")
      .eq("inspector_id", me.id)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(20),
  );
  return { attempts: rows };
});
