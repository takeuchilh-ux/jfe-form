import { handle, body, str, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { HttpError } from "@/lib/session";

/**
 * Google Routes API で車の経路距離を取得。
 * stops = [出発地, 経由地..., 到着地]（2〜10 地点）。区間ごとの距離と合計（km）を返す
 */
export const POST = handle(async (req: Request) => {
  await currentInspector();
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new HttpError(501, "経路検索は未設定です。距離を直接入力してください");
  const b = await body(req);
  const stops = (Array.isArray(b.stops) ? b.stops : []).map((s) => str(s, 300)).filter(Boolean);
  if (stops.length < 2) bad("出発地と目的地を入力してください");
  if (stops.length > 10) bad("経由地は 8 か所までです");

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.legs.distanceMeters",
    },
    body: JSON.stringify({
      origin: { address: stops[0] },
      destination: { address: stops[stops.length - 1] },
      intermediates: stops.slice(1, -1).map((address) => ({ address })),
      travelMode: "DRIVE",
      languageCode: "ja-JP",
      regionCode: "JP",
      units: "METRIC",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    routes?: { distanceMeters?: number; duration?: string; legs?: { distanceMeters?: number }[] }[];
    error?: { message?: string };
  };
  if (!res.ok) {
    console.error("routes api", json.error);
    throw new HttpError(502, "経路検索に失敗しました。距離を直接入力してください");
  }
  const route = json.routes?.[0];
  if (!route?.distanceMeters) bad("経路が見つかりませんでした。住所を確認してください");
  const km = (m?: number) => Math.round((m ?? 0) / 100) / 10;
  return {
    km: km(route.distanceMeters),
    legs: (route.legs ?? []).map((l) => km(l.distanceMeters)),
    minutes: route.duration ? Math.round(parseInt(route.duration, 10) / 60) : null,
  };
});
