import { fmtDate } from "./format";

/** 発注できる備品（発注単位・入数） */
export const ORDER_PRODUCTS = [
  { name: "不織布の白衣", unit: "枚", per: 1 },
  { name: "不織布のヘアカバー", unit: "個", per: 50 },
  { name: "シューズカバー", unit: "枚", per: 10 },
  { name: "ニトリル手袋", unit: "箱", per: 100 },
  { name: "検便容器", unit: "個", per: 1 },
  { name: "検便提出袋", unit: "袋", per: 1 },
  { name: "検便用封筒", unit: "枚", per: 1 },
] as const;

export type Product = (typeof ORDER_PRODUCTS)[number];

export function findProduct(name: string): Product | undefined {
  return ORDER_PRODUCTS.find((p) => p.name === name);
}

export const ORDER_MAIL_SUBJECT = "備品発注について";
/** 発注メールの宛先（固定） */
export const ORDER_MAIL_TO = "takeuchi.nxtb@gmail.com";

export type OrderItem = { name: string; qty: number; unit?: string; per?: number };

/** メール・履歴での 1 行表示（例：ニトリル手袋×2箱（入数:100）） */
export function itemLine(i: OrderItem) {
  const p = findProduct(i.name);
  const unit = i.unit ?? p?.unit ?? "";
  const per = i.per ?? p?.per;
  return `${i.name}×${i.qty}${unit}${per ? `（入数:${per}）` : ""}`;
}

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
    ...o.items.map(itemLine),
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

/** 端末のメールアプリで下書きを開く mailto: URL（iPhone は「メール」、Android は既定のメールアプリ） */
export function orderMailtoUrl(body: string) {
  const q = `subject=${encodeURIComponent(ORDER_MAIL_SUBJECT)}&body=${encodeURIComponent(body.replace(/\r?\n/g, "\r\n"))}`;
  return `mailto:${ORDER_MAIL_TO}?${q}`;
}
