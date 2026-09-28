"use client";

import { useState } from "react";
import { api, errMsg } from "@/lib/client";

export default function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) return setMsg({ type: "error", text: "新しいパスワード（確認）が一致しません" });
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/password", { body: { current, next } });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ type: "success", text: "パスワードを変更しました" });
    } catch (err) {
      setMsg({ type: "error", text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ maxWidth: 480 }} onSubmit={submit}>
      <h2>パスワード変更</h2>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <label className="field">
        <span>現在のパスワード</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      </label>
      <label className="field">
        <span>新しいパスワード（10 文字以上）</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} autoComplete="new-password" />
      </label>
      <label className="field">
        <span>新しいパスワード（確認）</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={10} autoComplete="new-password" />
      </label>
      <button className="btn primary" disabled={busy}>
        変更する
      </button>
    </form>
  );
}
