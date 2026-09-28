"use client";

import { useState } from "react";
import { api, errMsg } from "@/lib/client";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/login", { body: { email, password } });
      location.href = "/admin";
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <main className="liff" style={{ paddingTop: 80, maxWidth: 400 }}>
      <h1>衛生検査 管理画面</h1>
      <form className="card" onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <label className="field">
          <span>メールアドレス</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className="field">
          <span>パスワード</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button className="btn primary block" disabled={busy}>
          {busy ? "ログイン中…" : "ログイン"}
        </button>
      </form>
    </main>
  );
}
