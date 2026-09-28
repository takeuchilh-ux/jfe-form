"use client";

import { useState } from "react";
import { api, errMsg } from "@/lib/client";

type Status = { key: string; label: string; ok: boolean }[];

export default function LineCard({ status, webhookUrl, liffEndpoint }: { status: Status; webhookUrl: string; liffEndpoint: string }) {
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = status.every((s) => s.ok);

  async function setupRichMenu() {
    if (!confirm("公式 LINE のリッチメニューを設定します（全員のメニューが切り替わります）。よろしいですか？")) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/line/richmenu", { method: "POST" });
      setMsg({ type: "success", text: "リッチメニューを設定しました。LINE のトーク画面を開き直すと表示されます。" });
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h2>LINE 連携</h2>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <table style={{ marginBottom: 12 }}>
        <tbody>
          {status.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td className="small muted">
                <code>{s.key}</code>
              </td>
              <td>{s.ok ? <span className="badge ok">設定済</span> : <span className="badge ng">未設定</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        Webhook URL：<code>{webhookUrl}</code>
        <br />
        LIFF エンドポイント URL：<code>{liffEndpoint}</code>
      </p>
      <button className="btn primary" disabled={busy || !ready} onClick={setupRichMenu}>
        リッチメニューを設定する
      </button>
      {!ready && <p className="muted small mt">未設定の項目を Vercel に登録して再デプロイすると押せるようになります。</p>}
    </div>
  );
}
