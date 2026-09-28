import "server-only";
import { HttpError } from "./session";
import { db, must } from "./supabase";

export type Kind = "inspector" | "trainee";
export type MenuKey = "guest" | Kind;

/** このアプリが作るリッチメニューの名前（作り直し時に古いものを削除する目印） */
const NAME_PREFIX = "kensa:";

type Area = { label: string; path: string };

/** メニューごとのボタン（左上→右上→左下→右下）と画像 */
export const MENUS: Record<MenuKey, { name: string; image: string; height: number; areas: Area[] }> = {
  guest: {
    name: "未登録者メニュー",
    image: "/richmenu-guest.png",
    height: 843,
    areas: [{ label: "基本情報の登録", path: "/" }],
  },
  inspector: {
    name: "検査員メニュー",
    image: "/richmenu-inspector.png",
    height: 1686,
    areas: [
      { label: "マイスケジュール", path: "/schedule" },
      { label: "交通費申請", path: "/expenses" },
      { label: "基本情報の変更", path: "/profile" },
      { label: "発注", path: "/order" },
    ],
  },
  trainee: {
    name: "研修生メニュー",
    image: "/richmenu-trainee.png",
    height: 1686,
    areas: [
      { label: "マイスケジュール", path: "/schedule" },
      { label: "交通費申請", path: "/expenses" },
      { label: "基本情報の変更", path: "/profile" },
      { label: "50問テスト", path: "/test" },
    ],
  },
};

function definition(key: MenuKey, liffId: string) {
  const m = MENUS[key];
  const W = 2500;
  const cols = m.areas.length === 1 ? 1 : 2;
  const rows = Math.ceil(m.areas.length / cols);
  const w = W / cols;
  const h = m.height / rows;
  return {
    size: { width: W, height: m.height },
    selected: true,
    name: NAME_PREFIX + key,
    chatBarText: "メニュー",
    areas: m.areas.map((a, i) => ({
      bounds: { x: (i % cols) * w, y: Math.floor(i / cols) * h, width: w, height: h },
      action: { type: "uri", label: a.label, uri: `https://liff.line.me/${liffId}${a.path === "/" ? "" : a.path}` },
    })),
  };
}

async function line(path: string, init: RequestInit & { data?: boolean } = {}) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) throw new HttpError(400, "LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  const host = init.data ? "https://api-data.line.me" : "https://api.line.me";
  const res = await fetch(`${host}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new HttpError(502, `LINE API エラー (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

/**
 * 3 種類のリッチメニューを作り直す：未登録者用を全員のデフォルトにし、
 * 承認済みの検査員・研修生には区分ごとのメニューを個別に割り当てる。以前に作ったメニューは削除する。
 */
export async function setupRichMenus(origin: string) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
  if (!liffId) throw new HttpError(400, "NEXT_PUBLIC_LIFF_ID が未設定です");

  const ids = {} as Record<MenuKey, string>;
  for (const key of Object.keys(MENUS) as MenuKey[]) {
    const image = await fetch(new URL(MENUS[key].image, origin));
    if (!image.ok) throw new HttpError(500, `リッチメニュー画像（${MENUS[key].image}）を読み込めませんでした`);
    const { richMenuId } = await line("/v2/bot/richmenu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(definition(key, liffId)),
    });
    await line(`/v2/bot/richmenu/${richMenuId}/content`, {
      method: "POST",
      data: true,
      headers: { "Content-Type": "image/png" },
      body: await image.arrayBuffer(),
    });
    ids[key] = richMenuId;
  }
  await line(`/v2/bot/user/all/richmenu/${ids.guest}`, { method: "POST" });
  must(
    await db()
      .from("kensa_settings")
      .update({ richmenu_guest_id: ids.guest, richmenu_inspector_id: ids.inspector, richmenu_trainee_id: ids.trainee })
      .eq("id", 1)
      .select("id"),
  );

  // 承認済みの人へ区分ごとのメニューを割り当て（最大 500 人ずつ）
  const people = must(
    await db().from("kensa_inspectors").select("line_user_id,kind").eq("active", true).not("approved_at", "is", null).not("line_user_id", "is", null),
  ) as { line_user_id: string; kind: Kind }[];
  let linked = 0;
  for (const kind of ["inspector", "trainee"] as Kind[]) {
    const userIds = people.filter((p) => p.kind === kind).map((p) => p.line_user_id);
    for (let i = 0; i < userIds.length; i += 500) {
      await line("/v2/bot/richmenu/bulk/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ richMenuId: ids[kind], userIds: userIds.slice(i, i + 500) }),
      });
      linked += Math.min(500, userIds.length - i);
    }
  }

  // 以前にこのアプリで作ったメニューを片付ける（旧名称「検査員メニュー」も対象）
  const { richmenus = [] } = (await line("/v2/bot/richmenu/list")) as { richmenus?: { richMenuId: string; name: string }[] };
  const current = new Set(Object.values(ids));
  for (const m of richmenus) {
    if ((m.name.startsWith(NAME_PREFIX) || m.name === "検査員メニュー") && !current.has(m.richMenuId)) {
      await line(`/v2/bot/richmenu/${m.richMenuId}`, { method: "DELETE" }).catch(() => {});
    }
  }
  return { ids, linked };
}

/**
 * 1 人分のメニューを区分・状態に合わせて切り替える。
 * 承認済みかつ有効なら区分のメニュー、それ以外は個別の割り当てを外して未登録者用（デフォルト）に戻す。
 * リッチメニュー未設定の場合は何もしない。失敗しても例外は投げずにメッセージを返す。
 */
export async function syncUserRichMenu(p: { line_user_id: string | null; kind: Kind; active: boolean; approved_at: string | null }): Promise<string | null> {
  if (!p.line_user_id) return null;
  try {
    const s = must(await db().from("kensa_settings").select("richmenu_inspector_id,richmenu_trainee_id").eq("id", 1).single());
    const menuId = p.kind === "inspector" ? s.richmenu_inspector_id : s.richmenu_trainee_id;
    if (!menuId) return null;
    if (p.active && p.approved_at) {
      await line(`/v2/bot/user/${p.line_user_id}/richmenu/${menuId}`, { method: "POST" });
    } else {
      await line(`/v2/bot/user/${p.line_user_id}/richmenu`, { method: "DELETE" });
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
