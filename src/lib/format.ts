const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-10-03" → "10/3(土)" */
export function fmtDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  const w = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${m}/${day}(${WEEK[w]})`;
}

/** "2026-10" → "2026年10月" */
export function fmtMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export function yen(n: number) {
  return `¥${n.toLocaleString("ja-JP")}`;
}

/** 日本時間の今日 "YYYY-MM-DD" */
export function todayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export function thisMonthJst() {
  return todayJst().slice(0, 7);
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function monthRange(ym: string) {
  const start = `${ym}-01`;
  const end = `${shiftMonth(ym, 1)}-01`;
  return { start, end };
}

export const EXPENSE_STATUS: Record<string, string> = {
  submitted: "申請中",
  approved: "承認済",
  rejected: "差戻し",
  paid: "支払済",
};

export const PERIOD_STATUS: Record<string, string> = {
  draft: "下書き",
  released: "リリース中",
  closed: "回答締切",
};
