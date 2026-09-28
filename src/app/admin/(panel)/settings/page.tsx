import { getSettings } from "@/lib/data";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <>
      <h1>設定</h1>
      <SettingsClient settings={settings} />
    </>
  );
}
