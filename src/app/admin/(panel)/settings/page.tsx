import { headers } from "next/headers";
import { getSettings } from "@/lib/data";
import SettingsClient from "./SettingsClient";
import PasswordForm from "./PasswordForm";
import LineCard from "./LineCard";

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
      <PasswordForm />
    </>
  );
}
