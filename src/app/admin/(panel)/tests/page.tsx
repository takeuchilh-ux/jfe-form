import { db, must } from "@/lib/supabase";
import { getSettings } from "@/lib/data";
import TestsClient, { type Attempt, type Question, type ExamRequest } from "./TestsClient";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TestsPage({ searchParams }: Props) {
  const tab = (await searchParams).tab;
  const [questions, attempts, requests, settings] = await Promise.all([
    db().from("kensa_questions").select("id,sort_order,category,group_key,question,correct_index,explanation,active").order("sort_order").order("created_at"),
    // 結果は本番テストのみ（練習は記録しない）
    db()
      .from("kensa_test_attempts")
      .select("id,score,total,passed,submitted_at,inspector:kensa_inspectors(name)")
      .not("request_id", "is", null)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(200),
    db()
      .from("kensa_test_requests")
      .select("id,exam_date,status,admin_comment,created_at,inspector:kensa_inspectors(name),attempt:kensa_test_attempts(score,total,passed,submitted_at)")
      .order("created_at", { ascending: false })
      .limit(200),
    getSettings(),
  ]);
  return (
    <>
      <h1>50問テスト</h1>
      <TestsClient
        initialTab={tab === "requests" ? "requests" : tab === "results" ? "results" : "questions"}
        questions={must(questions) as Question[]}
        attempts={must(attempts) as unknown as Attempt[]}
        requests={must(requests) as unknown as ExamRequest[]}
        settings={settings}
      />
    </>
  );
}
