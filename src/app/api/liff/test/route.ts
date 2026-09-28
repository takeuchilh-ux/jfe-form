import crypto from "node:crypto";
import { handle, body, isUuid, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, maybe, must } from "@/lib/supabase";
import { getSettings } from "@/lib/data";

type Question = { id: string; category: string; question: string; choices: string[]; correct_index: number; explanation: string };

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** テスト開始：有効な問題から出題数ぶんをランダムに選ぶ（正解は返さない） */
export const POST = handle(async () => {
  const me = await currentInspector();
  const settings = await getSettings();
  const all = must(await db().from("kensa_questions").select("id,category,question,choices").eq("active", true)) as Omit<
    Question,
    "correct_index" | "explanation"
  >[];
  if (!all.length) bad("テスト問題がまだ登録されていません");
  const picked = shuffle(all).slice(0, settings.test_question_count);
  const attempt = must(
    await db()
      .from("kensa_test_attempts")
      .insert({ inspector_id: me.id, question_ids: picked.map((q) => q.id), total: picked.length })
      .select("id")
      .single(),
  );
  return {
    attemptId: attempt.id,
    passScore: Math.min(settings.test_pass_score, picked.length),
    questions: picked.map((q) => ({ id: q.id, category: q.category, question: q.question, choices: q.choices })),
  };
});

/** 回答提出：採点して結果（正解・解説つき）を返す */
export const PUT = handle(async (req: Request) => {
  const me = await currentInspector();
  const b = await body<{ attemptId?: unknown; answers?: Record<string, unknown> }>(req);
  if (!isUuid(b.attemptId)) bad("attemptId が不正です");
  const attempt = maybe(
    await db().from("kensa_test_attempts").select("id,question_ids,submitted_at,total").eq("id", b.attemptId).eq("inspector_id", me.id).maybeSingle(),
  );
  if (!attempt) bad("受験データが見つかりません");
  if (attempt.submitted_at) bad("このテストは提出済みです");

  const ids = attempt.question_ids as string[];
  const questions = must(await db().from("kensa_questions").select("id,question,choices,correct_index,explanation").in("id", ids)) as Question[];
  const byId = new Map(questions.map((q) => [q.id, q]));
  const answers: Record<string, number | null> = {};
  let score = 0;
  for (const id of ids) {
    const raw = b.answers?.[id];
    const a = typeof raw === "number" && Number.isInteger(raw) ? raw : null;
    answers[id] = a;
    if (a !== null && byId.get(id)?.correct_index === a) score++;
  }
  const settings = await getSettings();
  const passed = score >= Math.min(settings.test_pass_score, attempt.total);
  // 提出済みでない場合のみ更新（二重提出対策）
  const updated = must(
    await db()
      .from("kensa_test_attempts")
      .update({ answers, score, passed, submitted_at: new Date().toISOString() })
      .eq("id", attempt.id)
      .is("submitted_at", null)
      .select("id"),
  );
  if (!updated.length) bad("このテストは提出済みです");

  return {
    score,
    total: attempt.total,
    passed,
    results: ids.map((id) => {
      const q = byId.get(id);
      return {
        id,
        question: q?.question ?? "（削除された問題）",
        choices: q?.choices ?? [],
        correct: q?.correct_index ?? -1,
        answer: answers[id],
        explanation: q?.explanation ?? "",
      };
    }),
  };
});
