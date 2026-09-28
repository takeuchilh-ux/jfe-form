import crypto from "node:crypto";
import { handle, body, isUuid, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { HttpError } from "@/lib/session";
import { db, maybe, must } from "@/lib/supabase";
import { getSettings } from "@/lib/data";
import { attemptsToday } from "@/lib/testing";

type Question = { id: string; category: string; group_key: string; question: string };

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * テスト開始（1 日の回数上限あり）。
 * 同じテーマ（group_key）の問題は 1 問だけ選び、テーマ・問題の順番とも毎回ランダムにする。正解は返さない。
 */
export const POST = handle(async () => {
  const me = await currentInspector();
  const settings = await getSettings();
  const used = await attemptsToday(me.id);
  if (used >= settings.test_daily_limit) {
    throw new HttpError(429, `本日の受験回数の上限（${settings.test_daily_limit} 回）に達しました。明日また受験してください。`);
  }

  const all = must(await db().from("kensa_questions").select("id,category,group_key,question").eq("active", true)) as Question[];
  if (!all.length) bad("テスト問題がまだ登録されていません");
  const groups = new Map<string, Question[]>();
  for (const q of all) {
    const key = q.group_key || q.id;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const picked = shuffle([...groups.values()])
    .slice(0, settings.test_question_count)
    .map((variants) => variants[crypto.randomInt(variants.length)]);

  const attempt = must(
    await db()
      .from("kensa_test_attempts")
      .insert({ inspector_id: me.id, question_ids: picked.map((q) => q.id), answers: {}, total: picked.length })
      .select("id")
      .single(),
  );
  return {
    attemptId: attempt.id,
    passScore: Math.min(settings.test_pass_score, picked.length),
    remaining: settings.test_daily_limit - used - 1,
    questions: picked.map((q) => ({ id: q.id, category: q.category, question: q.question })),
  };
});

/** 提出：サーバーに記録済みの回答で採点する（未回答は不正解） */
export const PUT = handle(async (req: Request) => {
  const me = await currentInspector();
  const b = await body<{ attemptId?: unknown }>(req);
  if (!isUuid(b.attemptId)) bad("attemptId が不正です");
  const attempt = maybe(
    await db().from("kensa_test_attempts").select("id,question_ids,answers,submitted_at,total").eq("id", b.attemptId).eq("inspector_id", me.id).maybeSingle(),
  );
  if (!attempt) bad("受験データが見つかりません");
  if (attempt.submitted_at) bad("このテストは提出済みです");

  const ids = attempt.question_ids as string[];
  const answers = (attempt.answers ?? {}) as Record<string, number>;
  const questions = must(await db().from("kensa_questions").select("id,question,correct_index,explanation").in("id", ids)) as {
    id: string;
    question: string;
    correct_index: number;
    explanation: string;
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

  return {
    score,
    total: attempt.total,
    passed,
    wrong: ids
      .filter((id) => byId.get(id)?.correct_index !== answers[id])
      .map((id) => {
        const q = byId.get(id);
        return {
          id,
          question: q?.question ?? "（削除された問題）",
          correct: q?.correct_index ?? -1,
          answer: answers[id] ?? null,
          explanation: q?.explanation ?? "",
        };
      }),
  };
});
