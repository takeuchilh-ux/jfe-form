import { handle, body, isUuid, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, maybe, must } from "@/lib/supabase";

/** 1 問ずつ回答を記録し、その場で正誤と解説を返す（同じ問題への回答のやり直しは不可） */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector();
  const b = await body<{ attemptId?: unknown; questionId?: unknown; answer?: unknown }>(req);
  if (!isUuid(b.attemptId) || !isUuid(b.questionId)) bad("リクエストが不正です");
  if (b.answer !== 0 && b.answer !== 1) bad("○ か × で回答してください");

  const attempt = maybe(
    await db().from("kensa_test_attempts").select("id,question_ids,answers,submitted_at").eq("id", b.attemptId).eq("inspector_id", me.id).maybeSingle(),
  );
  if (!attempt) bad("受験データが見つかりません");
  if (attempt.submitted_at) bad("このテストは提出済みです");
  if (!(attempt.question_ids as string[]).includes(b.questionId)) bad("このテストの問題ではありません");

  const answers = (attempt.answers ?? {}) as Record<string, number>;
  const q = must(await db().from("kensa_questions").select("correct_index,explanation").eq("id", b.questionId).single());
  // 既に回答済みなら最初の回答を維持して結果だけ返す
  if (answers[b.questionId] === undefined) {
    answers[b.questionId] = b.answer;
    must(await db().from("kensa_test_attempts").update({ answers }).eq("id", attempt.id).is("submitted_at", null).select("id"));
  }
  const answer = answers[b.questionId];
  return { answer, correct: q.correct_index, isCorrect: q.correct_index === answer, explanation: q.explanation };
});
