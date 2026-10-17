export type TrainLeg = { from: string; to: string; fare: number; round_trip: boolean };

/** 電車：区間運賃の合計（往復は 2 倍） */
export function trainTotal(legs: TrainLeg[]) {
  return legs.reduce((sum, l) => sum + Math.max(0, Math.round(l.fare)) * (l.round_trip ? 2 : 1), 0);
}

/** 車：高速・有料道路の利用表示（使っていなければ空） */
export function roadLabel(e: { use_highway?: boolean; use_toll?: boolean }) {
  return [e.use_highway && "高速道路", e.use_toll && "有料道路"].filter(Boolean).join("・") + (e.use_highway || e.use_toll ? "を利用" : "");
}

/** Yahoo!乗換案内の検索結果 URL（電車の運賃確認用） */
export function yahooTransitUrl(from: string, to: string) {
  const name = (s: string) => s.trim().replace(/駅$/, "");
  return `https://transit.yahoo.co.jp/search/result?${new URLSearchParams({ from: name(from), to: name(to) })}`;
}

/** Google マップの経路検索 URL（車）。stops = [出発地, 経由地..., 到着地] */
export function mapsDirUrl(stops: string[]) {
  const s = stops.filter(Boolean);
  const q = new URLSearchParams({ api: "1", origin: s[0] ?? "", destination: s[s.length - 1] ?? "", travelmode: "driving" });
  if (s.length > 2) q.set("waypoints", s.slice(1, -1).join("|"));
  return `https://www.google.com/maps/dir/?${q}`;
}
