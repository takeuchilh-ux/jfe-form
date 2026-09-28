// 公式 LINE のリッチメニュー（4 分割）を作成し、全ユーザーのデフォルトに設定します。
// 使い方: node --env-file=.env.local scripts/setup-richmenu.mjs
import { readFile } from "node:fs/promises";

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
if (!token || !liffId) {
  console.error("LINE_CHANNEL_ACCESS_TOKEN と NEXT_PUBLIC_LIFF_ID を設定してください");
  process.exit(1);
}
const liff = (path) => `https://liff.line.me/${liffId}${path}`;
const W = 2500, H = 1686, w = W / 2, h = H / 2;

const menu = {
  size: { width: W, height: H },
  selected: true,
  name: "検査員メニュー",
  chatBarText: "メニュー",
  areas: [
    { bounds: { x: 0, y: 0, width: w, height: h }, action: { type: "uri", label: "受注可否の回答", uri: liff("/offers") } },
    { bounds: { x: w, y: 0, width: w, height: h }, action: { type: "uri", label: "マイスケジュール", uri: liff("/schedule") } },
    { bounds: { x: 0, y: h, width: w, height: h }, action: { type: "uri", label: "交通費申請", uri: liff("/expenses") } },
    { bounds: { x: w, y: h, width: w, height: h }, action: { type: "uri", label: "50問テスト", uri: liff("/test") } },
  ],
};

async function call(url, init) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const { richMenuId } = await call("https://api.line.me/v2/bot/richmenu", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(menu),
});
const image = await readFile(new URL("./richmenu/richmenu.png", import.meta.url));
await call(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
  method: "POST",
  headers: { "Content-Type": "image/png" },
  body: image,
});
await call(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST", headers: {} });
console.log(`リッチメニューを設定しました: ${richMenuId}`);
