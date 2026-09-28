import { getSettings } from "@/lib/data";
import SettingsClient from "./SettingsClient";
import PasswordForm from "./PasswordForm";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <>
      <h1>設定</h1>
      <SettingsClient settings={settings} />
      <PasswordForm />
    </>
  );
}
