"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api, ApiError, errMsg } from "@/lib/client";
import ProfileFields, { EMPTY_PROFILE, type ProfileForm } from "./ProfileFields";

export type Me = {
  id: string;
  name: string;
  approved: boolean;
  address: string;
  routeSearch: boolean;
  testQuestionCount: number;
  testPassScore: number;
};

const Ctx = createContext<{ me: Me; refresh: () => Promise<void> } | null>(null);

export function useMe() {
  const c = useContext(Ctx);
  if (!c) throw new Error("LiffProvider の外で useMe が呼ばれました");
  return c;
}

type State =
  | { step: "loading" }
  | { step: "register"; idToken: string; lineName: string }
  | { step: "ready"; me: Me }
  | { step: "error"; message: string };

const RETRY_KEY = "kensa_liff_relogin";

export default function LiffProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ step: "loading" });
  const path = usePathname();

  const boot = useCallback(async () => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID?.trim();
    if (!liffId) return setState({ step: "error", message: "NEXT_PUBLIC_LIFF_ID が設定されていません" });
    const liff = (await import("@line/liff")).default;
    await liff.init({ liffId });

    // 既存のセッションがあればそのまま利用
    try {
      return setState({ step: "ready", me: await api<Me>("/api/liff/me") });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
    }

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href });
      return;
    }
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error("LINE の ID トークンを取得できませんでした。LIFF の scope に openid を追加してください");
    try {
      const r = await api<{ ok?: boolean; needRegister?: boolean; lineName?: string }>("/api/liff/session", { body: { idToken } });
      sessionStorage.removeItem(RETRY_KEY);
      if (r.needRegister) return setState({ step: "register", idToken, lineName: r.lineName ?? "" });
      setState({ step: "ready", me: await api<Me>("/api/liff/me") });
    } catch (e) {
      // ID トークンの期限切れ → 1 回だけ再ログイン
      if (e instanceof ApiError && e.status === 401 && !sessionStorage.getItem(RETRY_KEY)) {
        sessionStorage.setItem(RETRY_KEY, "1");
        liff.logout();
        liff.login({ redirectUri: location.href });
        return;
      }
      throw e;
    }
  }, []);

  useEffect(() => {
    boot().catch((e) => setState({ step: "error", message: errMsg(e) }));
  }, [boot]);

  const refresh = useCallback(async () => {
    setState({ step: "ready", me: await api<Me>("/api/liff/me") });
  }, []);

  if (state.step === "loading") return <main className="liff muted" style={{ paddingTop: 80, textAlign: "center" }}>読み込み中…</main>;
  if (state.step === "error")
    return (
      <main className="liff" style={{ paddingTop: 40 }}>
        <div className="alert error">{state.message}</div>
        <button className="btn" onClick={() => location.reload()}>
          再読み込み
        </button>
      </main>
    );
  if (state.step === "register") return <RegisterForm idToken={state.idToken} onDone={() => refresh().catch(() => location.reload())} />;

  // 承認前は基本情報の確認・変更のみ利用可能
  if (!state.me.approved && path !== "/liff/profile") {
    return (
      <main className="liff" style={{ paddingTop: 32 }}>
        <h1>ご登録ありがとうございます</h1>
        <div className="card">
          <p>
            {state.me.name} さんの基本情報を受け付けました。現在、<strong>管理者の承認待ち</strong>です。
          </p>
          <p className="muted">承認されると LINE でお知らせします。</p>
          <Link className="btn block mt" href="/liff/profile">
            登録内容を確認・変更する
          </Link>
        </div>
      </main>
    );
  }
  return <Ctx.Provider value={{ me: state.me, refresh }}>{children}</Ctx.Provider>;
}

function RegisterForm({ idToken, onDone }: { idToken: string; onDone: () => void }) {
  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/liff/register", { body: { idToken, profile: form } });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
      window.scrollTo({ top: 0 });
    }
  }
  return (
    <main className="liff">
      <h1>基本情報の登録</h1>
      <p className="muted">検査員としてのご登録に必要な情報を入力してください。* は必須です。</p>
      {error && <div className="alert error">{error}</div>}
      <form className="card" onSubmit={submit}>
        <ProfileFields value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
        <button className="btn primary block lg mt" disabled={busy}>
          {busy ? "登録中…" : "登録する"}
        </button>
      </form>
    </main>
  );
}
