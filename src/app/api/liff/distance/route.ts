import { handle, body, str, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { HttpError } from "@/lib/session";

/** Google Routes API で車の経路距離（km・片道）を取得 */
export const POST = handle(async (req: Request) => {
  await currentInspector();
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new HttpError(501, "経路検索は未設定です。距離を直接入力してください");
  const b = await body(req);
  const from = str(b.from, 300);
  const to = str(b.to, 300);
  if (!from || !to) bad("出発地と目的地を入力してください");

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { address: from },
      destination: { address: to },
      travelMode: "DRIVE",
      languageCode: "ja-JP",
      regionCode: "JP",
      units: "METRIC",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { routes?: { distanceMeters?: number; duration?: string }[]; error?: { message?: string } };
  if (!res.ok) {
    console.error("routes api", json.error);
    throw new HttpError(502, "経路検索に失敗しました。距離を直接入力してください");
  }
  const route = json.routes?.[0];
  if (!route?.distanceMeters) bad("経路が見つかりませんでした。住所を確認してください");
  return {
    km: Math.round(route.distanceMeters / 100) / 10,
    minutes: route.duration ? Math.round(parseInt(route.duration, 10) / 60) : null,
  };
});
