import { str, int } from "./api";

/** ○×問題の選択肢（correct_index 0 = ○、1 = ×） */
export const TF_CHOICES = ["○", "×"];

/** "○" / "×" / true / false / 0 / 1 を correct_index（0=○, 1=×）に変換。不正なら -1 */
export function toCorrectIndex(v: unknown): number {
  if (v === true || v === "○" || v === "〇" || v === "o" || v === "O" || v === 0 || v === "0") return 0;
  if (v === false || v === "×" || v === "x" || v === "X" || v === 1 || v === "1") return 1;
  return -1;
}

/** ○×問題の入力値を検証・整形。不正ならエラーメッセージ（文字列）を返す */
export function questionFields(b: Record<string, unknown>) {
  const question = str(b.question, 2000);
  const correct_index = toCorrectIndex("correct" in b ? b.correct : b.correct_index);
  if (!question) return "問題文を入力してください";
  if (correct_index < 0) return "正解（○ または ×）を指定してください";
  return {
    question,
    choices: TF_CHOICES,
    correct_index,
    category: str(b.category, 100),
    group_key: str(b.group_key, 100),
    explanation: str(b.explanation, 2000),
    ...(b.sort_order !== undefined ? { sort_order: int(b.sort_order) } : {}),
  };
}
