import { str, int } from "./api";

/** 問題の入力値を検証・整形。不正ならエラーメッセージ（文字列）を返す */
export function questionFields(b: Record<string, unknown>) {
  const question = str(b.question, 2000);
  const choices = (Array.isArray(b.choices) ? b.choices : []).map((c) => str(c, 500)).filter(Boolean);
  const correct_index = int(b.correct_index, -1);
  if (!question) return "問題文を入力してください";
  if (choices.length < 2 || choices.length > 6) return "選択肢は 2〜6 個にしてください";
  if (correct_index < 0 || correct_index >= choices.length) return "正解の番号が選択肢の範囲外です";
  return {
    question,
    choices,
    correct_index,
    category: str(b.category, 100),
    explanation: str(b.explanation, 2000),
    ...(b.sort_order !== undefined ? { sort_order: int(b.sort_order) } : {}),
  };
}
