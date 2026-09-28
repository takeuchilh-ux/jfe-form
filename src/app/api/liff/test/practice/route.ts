import { handle, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { getSettings } from "@/lib/data";
import { pickQuestions } from "@/lib/testing";

/** 練習用：正解・解説つきで出題（何回でも可・記録は残さない） */
export const GET = handle(async () => {
  await currentInspector({ only: "trainee" });
  const settings = await getSettings();
  const questions = await pickQuestions(settings.test_question_count);
  if (!questions.length) bad("テスト問題がまだ登録されていません");
  return {
    passScore: Math.min(settings.test_pass_score, questions.length),
    questions: questions.map((q) => ({ id: q.id, category: q.category, question: q.question, correct: q.correct_index, explanation: q.explanation })),
  };
});
