"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import type { Settings } from "@/lib/data";

export default function SettingsClient({ settings }: { settings: Settings }) {
  const router = useRouter();
  const [s, setS] = useState(settings);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/settings", { method: "PATCH", body: s });
      setMsg({ type: "success", text: "保存しました" });
      router.refresh();
    } catch (err) {
      setMsg({ type: "error", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ maxWidth: 480 }} onSubmit={save}>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <h2>交通費</h2>
      <label className="field">
        <span>車：1km あたりの単価（円）</span>
        <input type="number" min={0} value={s.car_rate_per_km} onChange={(e) => setS({ ...s, car_rate_per_km: Number(e.target.value) })} />
      </label>
      <p className="muted small">変更後の申請から適用されます（申請済みの金額は変わりません）。</p>
      <h2 className="mt">50問テスト</h2>
      <label className="field">
        <span>出題数</span>
        <input type="number" min={1} max={200} value={s.test_question_count} onChange={(e) => setS({ ...s, test_question_count: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>合格点（正解数）</span>
        <input type="number" min={0} value={s.test_pass_score} onChange={(e) => setS({ ...s, test_pass_score: Number(e.target.value) })} />
      </label>
      <button className="btn primary" disabled={busy}>
        保存
      </button>
    </form>
  );
}
