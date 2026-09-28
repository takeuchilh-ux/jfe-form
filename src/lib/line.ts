import "server-only";
import crypto from "node:crypto";
import { HttpError } from "./session";

const API = "https://api.line.me";

type LineMessage = Record<string, unknown>;

function token() {
  const t = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!t) throw new Error("LINE_CHANNEL_ACCESS_TOKEN が未設定です");
  return t;
}

/** LIFF で取得した ID トークンを LINE で検証し、LINE ユーザー ID と表示名を返す */
export async function verifyIdToken(idToken: string): Promise<{ userId: string; name: string }> {
  const clientId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!clientId) throw new Error("LINE_LOGIN_CHANNEL_ID が未設定です");
  const res = await fetch(`${API}/oauth2/v2.1/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: clientId }),
  });
  const json = (await res.json()) as { sub?: string; name?: string; error_description?: string };
  if (!res.ok || !json.sub) throw new HttpError(401, `LINE 認証に失敗しました: ${json.error_description ?? res.status}`);
  return { userId: json.sub, name: json.name ?? "" };
}

async function call(path: string, payload: unknown) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`LINE API エラー (${res.status}): ${await res.text()}`);
}

export async function pushMessage(to: string, messages: LineMessage[]) {
  await call("/v2/bot/message/push", { to, messages });
}

/** 最大 500 件ずつに分けて一斉送信 */
export async function multicast(to: string[], messages: LineMessage[]) {
  for (let i = 0; i < to.length; i += 500) {
    await call("/v2/bot/message/multicast", { to: to.slice(i, i + 500), messages });
  }
}

export async function replyMessage(replyToken: string, messages: LineMessage[]) {
  await call("/v2/bot/message/reply", { replyToken, messages });
}

export function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** LIFF の画面 URL（例: liffUrl("/liff/offers?month=2026-10")） */
export function liffUrl(path: string) {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (liffId) return `https://liff.line.me/${liffId}${path.replace(/^\/liff/, "")}`;
  return `${process.env.APP_BASE_URL ?? ""}${path}`;
}

/** テキスト＋ボタン 1 つの Flex メッセージ */
export function buttonMessage(opts: { altText: string; title: string; lines: string[]; label: string; uri: string }) {
  return {
    type: "flex",
    altText: opts.altText,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: opts.title, weight: "bold", size: "md", wrap: true },
          ...opts.lines.map((t) => ({ type: "text", text: t, size: "sm", color: "#555555", wrap: true })),
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "button", style: "primary", color: "#0E7C66", action: { type: "uri", label: opts.label, uri: opts.uri } },
        ],
      },
    },
  };
}
