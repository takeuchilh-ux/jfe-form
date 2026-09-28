import { str } from "./api";

export const PROFILE_KEYS = [
  "last_name",
  "first_name",
  "phone",
  "email",
  "address",
  "bank_name",
  "branch_name",
  "branch_number",
  "account_type",
  "account_number",
  "account_holder",
] as const;

export type Profile = Record<(typeof PROFILE_KEYS)[number], string>;

/** 基本情報の入力値を検証・整形。不正ならエラーメッセージ（文字列）を返す */
export function parseProfile(b: Record<string, unknown>): Profile | string {
  const p = Object.fromEntries(PROFILE_KEYS.map((k) => [k, str(b[k], k === "address" ? 300 : 100)])) as Profile;
  p.phone = p.phone.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  p.branch_number = toHalf(p.branch_number);
  p.account_number = toHalf(p.account_number);
  if (!p.last_name || !p.first_name) return "姓と名を入力してください";
  if (!/^[0-9+\-() ]{10,15}$/.test(p.phone)) return "電話番号を正しく入力してください";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return "メールアドレスを正しく入力してください";
  if (!p.bank_name || !p.branch_name) return "銀行名と支店名を入力してください";
  if (p.branch_number && !/^\d{3}$/.test(p.branch_number)) return "支店番号は 3 桁の数字で入力してください";
  if (!["普通", "当座"].includes(p.account_type)) return "口座種別を選択してください";
  if (!/^\d{7}$/.test(p.account_number)) return "口座番号は 7 桁の数字で入力してください";
  if (!p.account_holder) return "口座名義を入力してください";
  return p;
}

function toHalf(s: string) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, "");
}

export function fullName(p: { last_name: string; first_name: string }) {
  return `${p.last_name} ${p.first_name}`.trim();
}
