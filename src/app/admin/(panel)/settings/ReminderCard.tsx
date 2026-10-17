"use client";

import { useState } from "react";
import { api, errMsg } from "@/lib/client";

/** 前日リマインド（毎日 18 時ごろ自動送信）の説明と、手動送信 */
export default function ReminderCard({ cronReady }: { cronReady: boolean }) {
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendNow() {
    if (!confirm("明日の検査の担当者・同行の研修生へ、今すぐ LINE でリマインドを送ります（送信済みの人には送りません）。よろしいですか？")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ date: string; sent: number; skipped: string[]; errors: string[] }>("/api/admin/reminders", { method: "POST" });
      const parts = [`${r.date} の検査について ${r.sent} 名に送りました`];
      if (r.skipped.length) parts.push(`LINE 未連携のため未送信：${r.skipped.join("、")}`);
      if (r.errors.length) parts.push(`送信エラー：${r.errors.join(" / ")}`);
      setMsg({ type: r.errors.length ? "warn" : "success", text: parts.join("／") });
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h2>前日リマインド</h2>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <p className="small">
        毎日 18 時ごろ、翌日に検査がある検査員と同行の研修生へ、LINE で時間・店舗・住所をお知らせします。日時が変更された検査は、新しい日付の前日に改めて送ります。
      </p>
      {!cronReady && (
        <div className="alert warn">
          自動送信の設定（環境変数 <code>CRON_SECRET</code>）がまだありません。下のボタンで手動送信はできます。
        </div>
      )}
      <button className="btn" disabled={busy} onClick={sendNow}>
        {busy ? "送信中…" : "明日分のリマインドを今すぐ送る"}
      </button>
    </div>
  );
}
