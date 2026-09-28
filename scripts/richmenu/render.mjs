// リッチメニュー画像（public/richmenu-*.png）を生成します。
// 使い方: playwright を用意した環境で `node scripts/richmenu/render.mjs`
// ボタンの並びは src/lib/richmenu.ts の MENUS と合わせてください。
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const MENUS = {
  inspector: { height: 1686, cells: [["📅", "マイスケジュール", "#0e7c66"], ["🚗", "交通費申請", "#13866f"], ["👤", "基本情報の変更", "#1a6f8a"], ["📦", "発注", "#b7791f"]] },
  trainee: { height: 1686, cells: [["📅", "マイスケジュール", "#0e7c66"], ["🚗", "交通費申請", "#13866f"], ["👤", "基本情報の変更", "#1a6f8a"], ["📝", "50問テスト", "#6a4c93"]] },
  guest: { height: 843, cells: [["📝", "基本情報の登録・登録状況の確認", "#0e7c66"]] },
};

const html = (m) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&display=block" rel="stylesheet">
<style>
html,body{margin:0;width:2500px;height:${m.height}px}
body{display:grid;grid-template-columns:${m.cells.length > 1 ? "1fr 1fr" : "1fr"};gap:12px;background:#d7e6e1;font-family:"Noto Sans JP",sans-serif}
.c{display:flex;flex-direction:${m.cells.length > 1 ? "column" : "row"};align-items:center;justify-content:center;gap:48px;color:#fff}
.i{font-size:${m.cells.length > 1 ? 260 : 200}px;line-height:1;font-family:"Noto Color Emoji",sans-serif}
.l{font-size:${m.cells.length > 1 ? 120 : 110}px;font-weight:700;letter-spacing:4px}
</style></head><body>${m.cells.map(([i, l, bg]) => `<div class="c" style="background:${bg}"><div class="i">${i}</div><div class="l">${l}</div></div>`).join("")}</body></html>`;

const out = (name) => process.env.RICHMENU_OUT ? `${process.env.RICHMENU_OUT}/richmenu-${name}.png` : fileURLToPath(new URL(`../../public/richmenu-${name}.png`, import.meta.url));
const browser = await chromium.launch();
for (const [name, m] of Object.entries(MENUS)) {
  const page = await browser.newPage({ viewport: { width: 2500, height: m.height } });
  await page.setContent(html(m), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out(name) });
  console.log("wrote", out(name));
}
await browser.close();
