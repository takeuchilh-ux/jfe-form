import { handle, body, isUuid, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { HttpError } from "@/lib/session";
import { db, maybe, must } from "@/lib/supabase";
import { getSettings } from "@/lib/data";
import { attemptForRequest, openRequest, pickQuestions } from "@/lib/testing";
import { todayJst } from "@/lib/format";

/** 本番テストの状況：現在の申請・今日受験できるか・過去の結果 */
export const GET = handle(async () => {
  const me = await currentInspector();
  const [request, history, lastRejected] = await Promise.all([
    openRequest(me.id),
    db()
      .from("kensa_test_attempts")
      .select("id,score,total,passed,submitted_at")
      .eq("inspector_id", me.id)
      .not("request_id", "is", null)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(20),
    db()
      .from("kensa_test_requests")
      .select("exam_date,admin_comment,decided_at")
      .eq("inspector_id", me.id)
      .eq("status", "rejected")
      .order("decided_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  let inProgress = false;
  if (request?.status === "approved") {
    const a = await attemptForRequest(request.id);
    inProgress = !!a && !a.submitted_at;
  }
  return {
    request,
    canStart: request?.status === "approved" && request.exam_date === todayJst(),
    inProgress,
    lastRejected: request ? null : maybe(lastRejected),
    history: must(history),
  };
});

/** 本番テスト開始（承認済み・受験日当日のみ）。開始済みなら続きから再開する。正解は返さない */
export const POST = handle(async () => {
  const me = await currentInspector();
  const request = await openRequest(me.id);
  if (!request || request.status !== "approved") throw new HttpError(403, "本番テストは申請して管理者の承認を受けると受験できます");
  if (request.exam_date !== todayJst()) throw new HttpError(403, `本番テストは受験日（${request.exam_date}）当日に受験できます`);
  const settings = await getSettings();

  let attempt = await attemptForRequest(request.id);
  if (attempt?.submitted_at) bad("この本番テストは提出済みです");
  if (!attempt) {
    const picked = await pickQuestions(settings.test_question_count);
    if (!picked.length) bad("テスト問題がまだ登録されていません");
    attempt = must(
      await db()
        .from("kensa_test_attempts")
        .insert({ inspector_id: me.id, request_id: request.id, question_ids: picked.map((q) => q.id), answers: {}, total: picked.length })
        .select("id,question_ids,answers,submitted_at,total")
        .single(),
    );
  }
  const ids = attempt!.question_ids;
  const qs = must(await db().from("kensa_questions").select("id,category,question").in("id", ids)) as { id: string; category: string; question: string }[];
  const byId = new Map(qs.map((q) => [q.id, q]));
  return {
    attemptId: attempt!.id,
    passScore: Math.min(settings.test_pass_score, ids.length),
    answers: attempt!.answers ?? {},
    questions: ids.map((id) => byId.get(id) ?? { id, category: "", question: "（削除された問題）" }),
  };
});

/** 提出：記録済みの回答で採点し、点数と間違えた問題（正解つき）を返す */
export const PUT = handle(async (req: Request) => {
  const me = await currentInspector();
  const b = await body<{ attemptId?: unknown }>(req);
  if (!isUuid(b.attemptId)) bad("attemptId が不正です");
  const attempt = maybe(
    await db()
      .from("kensa_test_attempts")
      .select("id,request_id,question_ids,answers,submitted_at,total")
      .eq("id", b.attemptId)
      .eq("inspector_id", me.id)
      .maybeSingle(),
  );
  if (!attempt) bad("受験データが見つかりません");
  if (attempt.submitted_at) bad("このテストは提出済みです");

  const ids = attempt.question_ids as string[];
  const answers = (attempt.answers ?? {}) as Record<string, number>;
  const questions = must(await db().from("kensa_questions").select("id,question,correct_index").in("id", ids)) as {
    id: string;
    question: string;
    correct_index: number;
  }[];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const score = ids.filter((id) => answers[id] !== undefined && byId.get(id)?.correct_index === answers[id]).length;
  const settings = await getSettings();
  const passed = score >= Math.min(settings.test_pass_score, attempt.total);

  const updated = must(
    await db()
      .from("kensa_test_attempts")
      .update({ score, passed, submitted_at: new Date().toISOString() })
      .eq("id", attempt.id)
      .is("submitted_at", null)
      .select("id"),
  );
  if (!updated.length) bad("このテストは提出済みです");
  if (attempt.request_id) {
    must(await db().from("kensa_test_requests").update({ status: "completed" }).eq("id", attempt.request_id).select("id"));
  }

  return {
    score,
    total: attempt.total,
    passed,
    wrong: ids
      .map((id, i) => ({ id, no: i + 1, q: byId.get(id) }))
      .filter(({ id, q }) => q?.correct_index !== answers[id])
      .map(({ id, no, q }) => ({ id, no, question: q?.question ?? "（削除された問題）", correct: q?.correct_index ?? -1, answer: answers[id] ?? null })),
  };
});
