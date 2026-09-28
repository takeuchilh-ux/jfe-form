import "server-only";

const W = 2500;
const H = 1686;
export const RICHMENU_NAME = "検査員メニュー";

/** 検査員用リッチメニュー（2×2）の定義 */
export function richMenuDefinition(liffId: string) {
  const liff = (path: string) => `https://liff.line.me/${liffId}${path}`;
  const w = W / 2;
  const h = H / 2;
  return {
    size: { width: W, height: H },
    selected: true,
    name: RICHMENU_NAME,
    chatBarText: "メニュー",
    areas: [
      { bounds: { x: 0, y: 0, width: w, height: h }, action: { type: "uri", label: "マイスケジュール", uri: liff("/schedule") } },
      { bounds: { x: w, y: 0, width: w, height: h }, action: { type: "uri", label: "交通費申請", uri: liff("/expenses") } },
      { bounds: { x: 0, y: h, width: w, height: h }, action: { type: "uri", label: "基本情報の変更", uri: liff("/profile") } },
      { bounds: { x: w, y: h, width: w, height: h }, action: { type: "uri", label: "50問テスト", uri: liff("/test") } },
    ],
  };
}
