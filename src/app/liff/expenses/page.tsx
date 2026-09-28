"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import { api, errMsg, shrinkImage } from "@/lib/client";
import { EXPENSE_STATUS, fmtDate, fmtMonth, shiftMonth, thisMonthJst, todayJst, yen } from "@/lib/format";
import { mapsDirUrl, trainTotal, type TrainLeg } from "@/lib/expense";

type Expense = {
  id: string;
  use_date: string;
  transport: "car" | "train";
  distance_km: number | null;
  route_stops: string[];
  parking_fee: number;
  train_legs: TrainLeg[];
  amount: number;
  note: string;
  status: string;
  admin_comment: string;
  receipt_count: number;
  links: { inspection_id: string; inspection: { time_slot: string; store: { name: string } | null } | null }[];
};
type Case = { id: string; date: string; time: string; store: string; address: string; role: string; expenses: Expense[] };
type Data = { month: string; cases: Case[]; others: Expense[]; history: Expense[] };
type Target = { kind: "case"; c: Case } | { kind: "other" };

const BADGE: Record<string, string> = { submitted: "info", approved: "ok", rejected: "ng", paid: "" };
const MAX_RECEIPTS = 10;

export default function ExpensesPage() {
  const [tab, setTab] = useState<"cases" | "history">("cases");
  const [month, setMonth] = useState(thisMonthJst());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  const initialCase = useRef(new URLSearchParams(location.search).get("new"));

  const load = useCallback(async (m: string) => {
    setError("");
    try {
      const d = await api<Data>(`/api/liff/expenses?month=${m}`);
      setData(d);
      // マイスケジュールの「交通費を申請」から来た場合は、その案件の申請画面を開く
      if (initialCase.current) {
        const c = d.cases.find((x) => x.id === initialCase.current);
        initialCase.current = null;
        if (c) setTarget({ kind: "case", c });
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);
  useEffect(() => {
    load(month);
  }, [load, month]);

  async function withdraw(id: string) {
    if (!confirm("この申請を取り下げますか？")) return;
    try {
      await api(`/api/liff/expenses/${id}`, { method: "DELETE" });
      setDone("申請を取り下げました");
      load(month);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  if (target && data) {
    const dayCases = target.kind === "case" ? data.cases.filter((c) => c.date === target.c.date).sort((a, b) => a.time.localeCompare(b.time)) : [];
    return (
      <NewExpense
        target={target}
        dayCases={dayCases}
        onCancel={() => setTarget(null)}
        onDone={() => {
          setTarget(null);
          setDone("交通費を申請しました");
          load(month);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <main className="liff">
      <LiffHeader title="交通費申請" />
      {done && <div className="alert success">{done}</div>}
      {error && <div className="alert error">{error}</div>}
      <div className="seg" style={{ display: "flex", marginBottom: 12 }}>
        <button style={{ flex: 1 }} className={tab === "cases" ? "on" : ""} onClick={() => setTab("cases")}>
          案件から申請
        </button>
        <button style={{ flex: 1 }} className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>
          申請履歴
        </button>
      </div>
      {!data && !error && <p className="muted">読み込み中…</p>}
      {data && tab === "cases" && <CaseList data={data} onNew={setTarget} onWithdraw={withdraw} />}
      {data && tab === "history" && <History data={data} month={month} setMonth={setMonth} onWithdraw={withdraw} />}
    </main>
  );
}

/* ───────── 案件一覧（日付ごとに折りたたみ） ───────── */
function CaseList({ data, onNew, onWithdraw }: { data: Data; onNew: (t: Target) => void; onWithdraw: (id: string) => void }) {
  const days = useMemo(() => {
    const m = new Map<string, Case[]>();
    for (const c of data.cases) m.set(c.date, [...(m.get(c.date) ?? []), c]);
    return [...m.entries()].map(([date, cs]) => ({ date, cases: cs.sort((a, b) => a.time.localeCompare(b.time)) }));
  }, [data.cases]);

  return (
    <>
      {days.length === 0 && <div className="card muted">直近 60 日間に担当した案件はありません。</div>}
      {days.map(({ date, cases }, i) => {
        const pending = cases.filter((c) => c.expenses.length === 0).length;
        return (
          <details key={date} className="acc" open={i < 2 || date === todayJst()}>
            <summary>
              <span className="grow">
                <strong>{fmtDate(date)}</strong> <span className="muted small">{cases.length} 件</span>
              </span>
              {pending > 0 ? <span className="badge warn">未申請 {pending}</span> : <span className="badge ok">申請済</span>}
            </summary>
            <div className="acc-body">
              {cases.length > 1 && <p className="small muted">同じ日に複数の案件があります。移動ごとに案件単位で申請してください。</p>}
              {cases.map((c, idx) => (
                <div key={c.id} className="case-row">
                  <div className="row between" style={{ alignItems: "flex-start" }}>
                    <div className="grow">
                      <div className="small muted">
                        {cases.length > 1 && `${idx + 1} 件目　`}
                        {c.time}
                        {c.role === "trainee" && <span className="badge"> 同行</span>}
                      </div>
                      <strong>{c.store}</strong>
                    </div>
                    <button className={`btn sm ${c.expenses.length ? "" : "primary"}`} onClick={() => onNew({ kind: "case", c })}>
                      ＋ 登録
                    </button>
                  </div>
                  {c.expenses.map((e) => (
                    <ExpenseLine key={e.id} e={e} onWithdraw={onWithdraw} />
                  ))}
                </div>
              ))}
            </div>
          </details>
        );
      })}
      <details className="acc">
        <summary>
          <span className="grow">案件以外の交通費</span>
          {data.others.length > 0 && <span className="badge">{data.others.length} 件</span>}
        </summary>
        <div className="acc-body">
          <p className="small muted">案件に紐づかない移動（研修・打合せなど）はこちらから申請します。</p>
          {data.others.map((e) => (
            <ExpenseLine key={e.id} e={e} onWithdraw={onWithdraw} showDate />
          ))}
          <button className="btn block mt" onClick={() => onNew({ kind: "other" })}>
            ＋ 案件以外の交通費を申請
          </button>
        </div>
      </details>
    </>
  );
}

function summaryText(e: Expense) {
  return e.transport === "car" ? `🚗 ${e.distance_km} km${e.parking_fee ? `＋駐車場 ${yen(e.parking_fee)}` : ""}` : `🚃 ${yen(e.amount)}`;
}

/** 案件の中に表示する 1 行（タップで詳細） */
function ExpenseLine({ e, onWithdraw, showDate }: { e: Expense; onWithdraw: (id: string) => void; showDate?: boolean }) {
  return (
    <details className="exp-line">
      <summary>
        <span className="grow small">
          {showDate && `${fmtDate(e.use_date)}　`}
          {summaryText(e)}
          {e.receipt_count > 0 && ` 🧾${e.receipt_count}`}
        </span>
        <span className={`badge ${BADGE[e.status]}`}>{EXPENSE_STATUS[e.status]}</span>
      </summary>
      <ExpenseDetail e={e} onWithdraw={onWithdraw} />
    </details>
  );
}

function ExpenseDetail({ e, onWithdraw }: { e: Expense; onWithdraw: (id: string) => void }) {
  return (
    <div className="small" style={{ padding: "6px 2px 2px" }}>
      {e.transport === "car" ? (
        e.route_stops.length >= 2 && (
          <p>
            経路：
            <a href={mapsDirUrl(e.route_stops)} target="_blank" rel="noreferrer">
              {e.route_stops.join(" → ")}
            </a>
          </p>
        )
      ) : (
        e.train_legs.map((l, i) => (
          <p key={i}>
            {l.from}→{l.to} {yen(l.fare)}
            {l.round_trip && "（往復）"}
          </p>
        ))
      )}
      {e.note && <p className="muted">備考：{e.note}</p>}
      {e.admin_comment && <div className="alert warn small">管理者より：{e.admin_comment}</div>}
      {["submitted", "rejected"].includes(e.status) && (
        <button className="btn sm danger" onClick={() => onWithdraw(e.id)}>
          取り下げ
        </button>
      )}
    </div>
  );
}

/* ───────── 申請履歴（月別） ───────── */
function History({ data, month, setMonth, onWithdraw }: { data: Data; month: string; setMonth: (m: string) => void; onWithdraw: (id: string) => void }) {
  const valid = data.history.filter((e) => e.status !== "rejected");
  const total = valid.filter((e) => e.transport === "train").reduce((s, e) => s + e.amount, 0);
  const parking = valid.filter((e) => e.transport === "car").reduce((s, e) => s + e.parking_fee, 0);
  const km = Math.round(valid.reduce((s, e) => s + Number(e.distance_km ?? 0), 0) * 10) / 10;
  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, -1))}>
          ◀
        </button>
        <strong>{fmtMonth(month)}</strong>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, 1))}>
          ▶
        </button>
      </div>
      <div className="card small row between">
        <span>
          車 <strong>{km} km</strong>
        </span>
        <span>
          駐車場 <strong>{yen(parking)}</strong>
        </span>
        <span>
          電車 <strong>{yen(total)}</strong>
        </span>
      </div>
      {data.history.length === 0 && <div className="card muted">この月の申請はありません。</div>}
      {data.history.map((e) => {
        const stores = e.links.map((l) => l.inspection?.store?.name).filter(Boolean).join("、");
        return (
          <details key={e.id} className="acc">
            <summary>
              <span className="grow">
                <strong>{fmtDate(e.use_date)}</strong> <span className="small">{summaryText(e)}</span>
                {stores && <div className="small muted">{stores}</div>}
              </span>
              <span className={`badge ${BADGE[e.status]}`}>{EXPENSE_STATUS[e.status]}</span>
            </summary>
            <div className="acc-body">
              {e.receipt_count > 0 && <p className="small">レシート {e.receipt_count} 枚</p>}
              <ExpenseDetail e={e} onWithdraw={onWithdraw} />
            </div>
          </details>
        );
      })}
    </>
  );
}

/* ───────── 申請フォーム ───────── */
function NewExpense({ target, dayCases, onCancel, onDone }: { target: Target; dayCases: Case[]; onCancel: () => void; onDone: () => void }) {
  const { me } = useMe();
  const c = target.kind === "case" ? target.c : null;
  const idx = c ? dayCases.findIndex((x) => x.id === c.id) : -1;
  const prev = idx > 0 ? dayCases[idx - 1] : null;
  const isLast = c ? idx === dayCases.length - 1 : false;

  const [date, setDate] = useState(c?.date ?? todayJst());
  const [transport, setTransport] = useState<"car" | "train">("car");
  // 車の経路：前の案件（なければ自宅）→ 経由地 → この案件 →（最後の案件なら自宅へ戻る）
  const [start, setStart] = useState(prev?.address || me.address);
  const [via, setVia] = useState<string[]>([]);
  const [dest, setDest] = useState(c?.address ?? "");
  const [returnHome, setReturnHome] = useState(isLast && !!c);
  const [home, setHome] = useState(me.address);
  const [distance, setDistance] = useState("");
  const [legKm, setLegKm] = useState<number[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [routeMsg, setRouteMsg] = useState("");
  const [parking, setParking] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [legs, setLegs] = useState<TrainLeg[]>([{ from: "", to: "", fare: 0, round_trip: false }]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const stops = [start, ...via, dest, ...(returnHome ? [home] : [])].map((s) => s.trim());
  const stopsReady = stops.length >= 2 && stops.every(Boolean);
  const touch = () => (setLegKm(null), setRouteMsg(""));

  async function searchRoute() {
    setSearching(true);
    setRouteMsg("");
    try {
      const r = await api<{ km: number; legs: number[]; minutes: number | null }>("/api/liff/distance", { body: { stops } });
      setDistance(String(r.km));
      setLegKm(r.legs);
      setRouteMsg(`合計 ${r.km} km${r.minutes ? `（運転 約 ${r.minutes} 分）` : ""}`);
    } catch (err) {
      setRouteMsg(errMsg(err));
    } finally {
      setSearching(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("use_date", date);
      fd.set("transport", transport);
      fd.set("note", note);
      if (c) fd.append("inspection_ids", c.id);
      if (transport === "car") {
        fd.set("distance_km", distance);
        fd.set("route_stops", JSON.stringify(stops.filter(Boolean)));
        fd.set("parking_fee", parking || "0");
      } else {
        fd.set("train_legs", JSON.stringify(legs));
      }
      for (const f of files) fd.append("receipts", f);
      await api("/api/liff/expenses", { form: fd });
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
      window.scrollTo({ top: 0 });
    }
  }

  const setLeg = (i: number, patch: Partial<TrainLeg>) => setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const embedKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY;

  return (
    <main className="liff">
      <div className="liff-header">
        <button className="btn sm" onClick={onCancel}>
          ‹ 戻る
        </button>
        <h1>交通費を登録</h1>
      </div>
      {error && <div className="alert error">{error}</div>}
      <form onSubmit={submit}>
        <div className="card">
          {c ? (
            <>
              <div className="small muted">
                {fmtDate(c.date)} {c.time}
                {dayCases.length > 1 && `（この日 ${idx + 1} / ${dayCases.length} 件目）`}
              </div>
              <strong>{c.store}</strong>
            </>
          ) : (
            <label className="field" style={{ marginBottom: 0 }}>
              <span>利用日</span>
              <input type="date" value={date} max={todayJst()} onChange={(ev) => setDate(ev.target.value)} required />
            </label>
          )}
          <div className="seg mt" style={{ display: "flex" }}>
            <button type="button" style={{ flex: 1 }} className={transport === "car" ? "on" : ""} onClick={() => setTransport("car")}>
              🚗 車
            </button>
            <button type="button" style={{ flex: 1 }} className={transport === "train" ? "on" : ""} onClick={() => setTransport("train")}>
              🚃 電車
            </button>
          </div>
        </div>

        {transport === "car" ? (
          <div className="card">
            <h3>経路と距離</h3>
            <div className="route">
              <label className="field">
                <span>出発地{prev ? `（前の案件：${prev.store}）` : "（自宅など）"}</span>
                <input type="text" value={start} onChange={(ev) => (setStart(ev.target.value), touch())} required />
              </label>
              {via.map((v, i) => (
                <div className="field" key={i}>
                  <span className="muted small" style={{ fontWeight: 600 }}>
                    立ち寄り {i + 1}
                  </span>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <input type="text" value={v} onChange={(ev) => (setVia(via.map((x, j) => (j === i ? ev.target.value : x))), touch())} required />
                    <button type="button" className="btn sm" onClick={() => (setVia(via.filter((_, j) => j !== i)), touch())}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <label className="field">
                <span>目的地{c ? `（${c.store}）` : ""}{legKm?.[via.length] !== undefined && `　${legKm[via.length]} km`}</span>
                <input type="text" value={dest} onChange={(ev) => (setDest(ev.target.value), touch())} required />
              </label>
              <label className="row small" style={{ marginBottom: 8 }}>
                <input type="checkbox" checked={returnHome} onChange={(ev) => (setReturnHome(ev.target.checked), touch())} />
                この案件のあと自宅へ戻る（帰りの距離も含める）
              </label>
              {returnHome && (
                <label className="field">
                  <span>帰着地{legKm && legKm.length === stops.length - 1 && `　${legKm[legKm.length - 1]} km`}</span>
                  <input type="text" value={home} onChange={(ev) => (setHome(ev.target.value), touch())} required />
                </label>
              )}
              {via.length < 6 && (
                <button type="button" className="btn sm" onClick={() => setVia([...via, ""])}>
                  ＋ 立ち寄り先を追加
                </button>
              )}
            </div>

            <div className="row mt" style={{ marginBottom: 8 }}>
              {me.routeSearch && (
                <button type="button" className="btn primary" disabled={searching || !stopsReady} onClick={searchRoute}>
                  {searching ? "検索中…" : "🔍 経路検索して距離を反映"}
                </button>
              )}
              {stopsReady && (
                <a className="btn" href={mapsDirUrl(stops)} target="_blank" rel="noreferrer">
                  🗺 地図で見る
                </a>
              )}
            </div>
            {routeMsg && <p className="small">{routeMsg}</p>}
            {stopsReady && embedKey && (
              <details className="exp-line">
                <summary>
                  <span className="grow small">地図を表示</span>
                </summary>
                <iframe
                  title="経路"
                  style={{ width: "100%", height: 220, border: 0, borderRadius: 8, marginTop: 8 }}
                  loading="lazy"
                  src={`https://www.google.com/maps/embed/v1/directions?${new URLSearchParams({
                    key: embedKey,
                    origin: stops[0],
                    destination: stops[stops.length - 1],
                    mode: "driving",
                    ...(stops.length > 2 ? { waypoints: stops.slice(1, -1).join("|") } : {}),
                  })}`}
                />
              </details>
            )}
            <div className="row mt" style={{ flexWrap: "nowrap" }}>
              <label className="field grow">
                <span>走行距離（km）</span>
                <input type="number" inputMode="decimal" step="0.1" min="0.1" value={distance} onChange={(ev) => setDistance(ev.target.value)} required />
              </label>
              <label className="field grow">
                <span>駐車場代（円・任意）</span>
                <input type="number" inputMode="numeric" min="0" value={parking} onChange={(ev) => setParking(ev.target.value)} placeholder="0" />
              </label>
            </div>
            {!me.routeSearch && <p className="muted small">地図で経路を確認し、距離を入力してください。</p>}
          </div>
        ) : (
          <div className="card">
            <h3>電車の区間</h3>
            {legs.map((l, i) => (
              <div key={i} style={{ borderBottom: i < legs.length - 1 ? "1px solid var(--border)" : undefined, paddingBottom: 8, marginBottom: 8 }}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input type="text" placeholder="乗車駅" value={l.from} onChange={(ev) => setLeg(i, { from: ev.target.value })} required />
                  <span>→</span>
                  <input type="text" placeholder="降車駅" value={l.to} onChange={(ev) => setLeg(i, { to: ev.target.value })} required />
                </div>
                <div className="row mt" style={{ flexWrap: "nowrap" }}>
                  <input type="number" inputMode="numeric" min="1" placeholder="運賃（円）" value={l.fare || ""} onChange={(ev) => setLeg(i, { fare: Number(ev.target.value) })} required />
                  <label className="row nowrap small">
                    <input type="checkbox" checked={l.round_trip} onChange={(ev) => setLeg(i, { round_trip: ev.target.checked })} /> 往復
                  </label>
                  {legs.length > 1 && (
                    <button type="button" className="btn sm" onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
            {legs.length < 10 && (
              <button type="button" className="btn sm" onClick={() => setLegs((ls) => [...ls, { from: "", to: "", fare: 0, round_trip: false }])}>
                ＋ 区間を追加
              </button>
            )}
          </div>
        )}

        <div className="card">
          <ReceiptPicker files={files} setFiles={setFiles} />
        </div>

        <details className="acc">
          <summary>
            <span className="grow">備考{note && `：${note}`}</span>
          </summary>
          <div className="acc-body">
            <input type="text" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="補足があれば入力" />
          </div>
        </details>

        <div className="sticky-foot">
          <div className="row between small" style={{ marginBottom: 6 }}>
            <span>申請内容</span>
            <strong>
              {transport === "car" ? `${distance || 0} km${Number(parking) > 0 ? ` ＋ 駐車場 ${yen(Number(parking))}` : ""}` : yen(trainTotal(legs))}
              {files.length > 0 && `・レシート ${files.length} 枚`}
            </strong>
          </div>
          <button className="btn primary block lg" disabled={busy}>
            {busy ? "送信中…" : "申請する"}
          </button>
        </div>
      </form>
    </main>
  );
}

/** レシート画像：1 枚ずつ追加・削除（最大 10 枚）。画像は追加時に縮小する */
function ReceiptPicker({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const urls = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : "")), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setAdding(true);
    const shrunk = await Promise.all(Array.from(list).map((f) => shrinkImage(f)));
    setFiles([...files, ...shrunk].slice(0, MAX_RECEIPTS));
    setAdding(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <div className="row between">
        <h3 style={{ margin: 0 }}>レシート（任意）</h3>
        <span className="muted small">
          {files.length} / {MAX_RECEIPTS} 枚
        </span>
      </div>
      <div className="receipt-grid">
        {files.map((f, i) => (
          <div key={i} className="receipt-thumb">
            {urls[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls[i]} alt={`レシート ${i + 1}`} />
            ) : (
              <span className="small">📄 {f.name}</span>
            )}
            <button type="button" aria-label="削除" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        {files.length < MAX_RECEIPTS && (
          <button type="button" className="receipt-add" disabled={adding} onClick={() => inputRef.current?.click()}>
            {adding ? "…" : "＋\n追加"}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(ev) => add(ev.target.files)} />
      <p className="muted small" style={{ marginTop: 6 }}>
        駐車場・高速料金などのレシートを 1 枚ずつ追加できます（写真を撮る／アルバムから選ぶ）。
      </p>
    </>
  );
}
