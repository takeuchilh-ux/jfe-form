export type TrainLeg = { from: string; to: string; fare: number; round_trip: boolean };

/** 電車：区間運賃の合計（往復は 2 倍） */
export function trainTotal(legs: TrainLeg[]) {
  return legs.reduce((sum, l) => sum + Math.max(0, Math.round(l.fare)) * (l.round_trip ? 2 : 1), 0);
}

/** Google マップの経路検索 URL（車） */
export function mapsDirUrl(from: string, to: string) {
  const q = new URLSearchParams({ api: "1", origin: from, destination: to, travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${q}`;
}
