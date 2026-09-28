"use client";

import { useEffect, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import ProfileFields, { type ProfileForm } from "@/components/ProfileFields";
import { api, errMsg } from "@/lib/client";

export default function ProfilePage() {
  const { me, refresh } = useMe();
  const [form, setForm] = useState<ProfileForm | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ProfileForm>("/api/liff/profile")
      .then(setForm)
      .catch((e) => setMsg({ type: "error", text: errMsg(e) }));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/liff/profile", { method: "PUT", body: form });
      await refresh();
      setMsg({ type: "success", text: "基本情報を更新しました" });
    } catch (err) {
      setMsg({ type: "error", text: errMsg(err) });
    } finally {
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <main className="liff">
      <LiffHeader title="基本情報の変更" back={me.approved ? "/liff" : null} />
      {!me.approved && <div className="alert warn">現在、管理者の承認待ちです。</div>}
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {!form ? (
        !msg && <p className="muted">読み込み中…</p>
      ) : (
        <form className="card" onSubmit={save}>
          <ProfileFields value={form} onChange={(p) => setForm({ ...form, ...p })} />
          <button className="btn primary block lg mt" disabled={busy}>
            {busy ? "保存中…" : "保存する"}
          </button>
        </form>
      )}
    </main>
  );
}
