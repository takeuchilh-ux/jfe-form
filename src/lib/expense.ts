export type TrainLeg = { from: string; to: string; fare: number; round_trip: boolean };

/** 電車：区間運賃の合計（往復は 2 倍） */
export function trainTotal(legs: TrainLeg[]) {
  return legs.reduce((sum, l) => sum + Math.max(0, Math.round(l.fare)) * (l.round_trip ? 2 : 1), 0);
}

/** 車：距離 × 単価（円未満切り捨て）＋駐車場代 */
export function carTotal(distanceKm: number, ratePerKm: number, parkingFee: number) {
  return Math.floor(Math.max(0, distanceKm) * Math.max(0, ratePerKm)) + Math.max(0, Math.round(parkingFee));
}
