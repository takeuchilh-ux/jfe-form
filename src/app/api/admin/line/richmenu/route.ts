import { handle } from "@/lib/api";
import { requireAdmin, HttpError } from "@/lib/session";
import { richMenuDefinition, RICHMENU_NAME } from "@/lib/richmenu";

async function line(path: string, init: RequestInit & { data?: boolean } = {}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) throw new HttpError(400, "LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  const host = init.data ? "https://api-data.line.me" : "https://api.line.me";
  const res = await fetch(`${host}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new HttpError(502, `LINE API エラー (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

/** 検査員用リッチメニューを作成して全員のデフォルトに設定（以前に作ったものは削除） */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  if (!liffId) throw new HttpError(400, "NEXT_PUBLIC_LIFF_ID が未設定です");

  const image = await fetch(new URL("/richmenu.png", req.url));
  if (!image.ok) throw new HttpError(500, "リッチメニュー画像を読み込めませんでした");

  const { richMenuId } = await line("/v2/bot/richmenu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(richMenuDefinition(liffId)),
  });
  await line(`/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    data: true,
    headers: { "Content-Type": "image/png" },
    body: await image.arrayBuffer(),
  });
  await line(`/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST" });

  // 以前にこのアプリで作ったメニューを片付ける
  const { richmenus = [] } = (await line("/v2/bot/richmenu/list")) as { richmenus?: { richMenuId: string; name: string }[] };
  for (const m of richmenus) {
    if (m.name === RICHMENU_NAME && m.richMenuId !== richMenuId) {
      await line(`/v2/bot/richmenu/${m.richMenuId}`, { method: "DELETE" }).catch(() => {});
    }
  }
  return { richMenuId };
});
