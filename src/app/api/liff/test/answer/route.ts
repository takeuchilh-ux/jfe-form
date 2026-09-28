import { handle, body, isUuid, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, maybe, must } from "@/lib/supabase";

/** 本番テストの回答を保存（提出までは何度でも変更可。正誤は返さない） */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector({ only: "trainee" });
  const b = await body<{ attemptId?: unknown; questionId?: unknown; answer?: unknown }>(req);
  if (!isUuid(b.attemptId) || !isUuid(b.questionId)) bad("リクエストが不正です");
  if (b.answer !== 0 && b.answer !== 1) bad("○ か × で回答してください");

  const attempt = maybe(
    await db().from("kensa_test_attempts").select("id,question_ids,answers,submitted_at").eq("id", b.attemptId).eq("inspector_id", me.id).maybeSingle(),
  );
  if (!attempt) bad("受験データが見つかりません");
  if (attempt.submitted_at) bad("このテストは提出済みです");
  if (!(attempt.question_ids as string[]).includes(b.questionId)) bad("このテストの問題ではありません");

  const answers = { ...((attempt.answers ?? {}) as Record<string, number>), [b.questionId]: b.answer };
  must(await db().from("kensa_test_attempts").update({ answers }).eq("id", attempt.id).is("submitted_at", null).select("id"));
  return { ok: true };
});
