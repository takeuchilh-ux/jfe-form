import { headers } from "next/headers";
import { getSettings } from "@/lib/data";
import SettingsClient from "./SettingsClient";
import PasswordForm from "./PasswordForm";
import LineCard from "./LineCard";
import { mailConfigured, ORDER_MAIL_TO } from "@/lib/mail";

const LINE_ENV = [
  { key: "LINE_CHANNEL_SECRET", label: "チャネルシークレット" },
  { key: "LINE_CHANNEL_ACCESS_TOKEN", label: "チャネルアクセストークン" },
  { key: "LINE_LOGIN_CHANNEL_ID", label: "LINE ログイン チャネル ID" },
  { key: "NEXT_PUBLIC_LIFF_ID", label: "LIFF ID" },
  { key: "LINE_ADD_FRIEND_URL", label: "友だち追加 URL" },
];

export default async function SettingsPage() {
  const settings = await getSettings();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <>
      <h1>設定</h1>
      <SettingsClient settings={settings} />
      <LineCard
        status={LINE_ENV.map((e) => ({ ...e, ok: !!process.env[e.key]?.trim() }))}
        webhookUrl={`${origin}/api/line/webhook`}
        liffEndpoint={`${origin}/liff`}
      />
      <div className="card" style={{ maxWidth: 640 }}>
        <h2>備品の発注メール</h2>
        <p>
          送信先：<code>{ORDER_MAIL_TO}</code>
        </p>
        <p className="small muted">
          発注メールは、検査員のスマホのメールアプリ（iPhone は「メール」、Android は既定のアプリ）で下書きが作成され、本人が送信します。サーバー側の設定は不要です。
          {mailConfigured() && "（サーバーからの送信も設定済みのため、「備品の発注」画面から送信・再送できます）"}
        </p>
      </div>
      <PasswordForm />
    </>
  );
}
