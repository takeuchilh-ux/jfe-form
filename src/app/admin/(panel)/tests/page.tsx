import { db, must } from "@/lib/supabase";
import { getSettings } from "@/lib/data";
import TestsClient, { type Attempt, type Question } from "./TestsClient";

export default async function TestsPage() {
  const [questions, attempts, settings] = await Promise.all([
    db().from("kensa_questions").select("id,sort_order,category,question,choices,correct_index,explanation,active").order("sort_order").order("created_at"),
    db()
      .from("kensa_test_attempts")
      .select("id,score,total,passed,submitted_at,inspector:kensa_inspectors(name)")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(200),
    getSettings(),
  ]);
  return (
    <>
      <h1>50問テスト</h1>
      <TestsClient
        questions={must(questions) as Question[]}
        attempts={must(attempts) as unknown as Attempt[]}
        settings={settings}
      />
    </>
  );
}
