import { fmtDate } from "./format";

/** 発注できる備品 */
export const ORDER_PRODUCTS = [
  "不織布の白衣",
  "不織布のヘアカバー",
  "シューズカバー",
  "ニトリル手袋",
  "検便容器",
  "検便提出袋",
  "検便用封筒",
] as const;

export const ORDER_MAIL_SUBJECT = "備品発注について";

export type OrderItem = { name: string; qty: number };

/** 納品希望日の表示（"asap" は最短） */
export function deliveryText(delivery: string) {
  return delivery === "asap" ? "最短" : `${delivery.slice(0, 4)}/${fmtDate(delivery)}`;
}

/** 発注メールの本文 */
export function orderMailBody(o: { company: string; lastName: string; items: OrderItem[]; note: string; delivery: string }) {
  const who = o.company ? `${o.company}の${o.lastName}です。` : `${o.lastName}です。`;
  return [
    "JFE東日本ジーエス株式会社",
    "八木様",
    "",
    "いつもお世話になっております。",
    who,
    "",
    "下記備品の発注をお願いしたくご連絡させていただきました。",
    "",
    ...o.items.map((i) => `${i.name}×${i.qty}`),
    "",
    `【備考】`,
    o.note || "なし",
    "",
    `【納品希望日】`,
    deliveryText(o.delivery),
    "",
    "以上",
    "",
    "お忙しいところ恐れ入りますが",
    "ご対応のほどよろしくお願いいたします。",
    "",
    "マスターズスタッフ株式会社",
    "伊藤",
  ].join("\n");
}
