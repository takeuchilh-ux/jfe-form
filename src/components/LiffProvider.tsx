"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, errMsg } from "@/lib/client";

export type Me = { id: string; name: string; carRatePerKm: number; testQuestionCount: number; testPassScore: number };

const Ctx = createContext<{ me: Me; close: () => void } | null>(null);

export function useMe() {
  const c = useContext(Ctx);
  if (!c) throw new Error("LiffProvider の外で useMe が呼ばれました");
  return c;
}

type State =
  | { step: "loading" }
  | { step: "link"; idToken: string; lineName: string }
  | { step: "ready"; me: Me }
  | { step: "error"; message: string };

const RETRY_KEY = "kensa_liff_relogin";

export default function LiffProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ step: "loading" });
  const [liffRef, setLiffRef] = useState<typeof import("@line/liff").default | null>(null);

  const boot = useCallback(async () => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) return setState({ step: "error", message: "NEXT_PUBLIC_LIFF_ID が設定されていません" });
    const liff = (await import("@line/liff")).default;
    setLiffRef(liff);
    await liff.init({ liffId });

    // 既存のセッションがあればそのまま利用
    try {
      const me = await api<Me>("/api/liff/me");
      return setState({ step: "ready", me });
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
      const r = await api<{ ok?: boolean; needLink?: boolean; lineName?: string }>("/api/liff/session", { body: { idToken } });
      sessionStorage.removeItem(RETRY_KEY);
      if (r.needLink) return setState({ step: "link", idToken, lineName: r.lineName ?? "" });
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

  const close = useCallback(() => {
    if (liffRef?.isInClient()) liffRef.closeWindow();
    else location.href = "/liff";
  }, [liffRef]);

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
  if (state.step === "link") return <LinkForm idToken={state.idToken} lineName={state.lineName} onDone={() => location.reload()} />;
  return <Ctx.Provider value={{ me: state.me, close }}>{children}</Ctx.Provider>;
}

function LinkForm({ idToken, lineName, onDone }: { idToken: string; lineName: string; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/liff/link", { body: { idToken, code } });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }
  return (
    <main className="liff" style={{ paddingTop: 32 }}>
      <h1>検査員アカウントの連携</h1>
      <form className="card" onSubmit={submit}>
        <p>
          {lineName && `${lineName} さん、`}はじめに管理者からお知らせした<strong>連携コード（6 桁）</strong>を入力してください。
        </p>
        {error && <div className="alert error">{error}</div>}
        <label className="field">
          <span>連携コード</span>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            value={code}
            maxLength={12}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ fontSize: 24, letterSpacing: 6, textAlign: "center" }}
            required
          />
        </label>
        <button className="btn primary block lg" disabled={busy}>
          連携する
        </button>
      </form>
    </main>
  );
}
