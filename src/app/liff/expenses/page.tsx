"use client";

import { useCallback, useEffect, useState } from "react";
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
  links: { inspection: { time_slot: string; store: { name: string } | null } | null }[];
};
type Insp = { id: string; date: string; time: string; store: string; address: string };
type Data = { month: string; expenses: Expense[]; inspections: Insp[] };

const BADGE: Record<string, string> = { submitted: "info", approved: "ok", rejected: "ng", paid: "" };

export default function ExpensesPage() {
  const [month, setMonth] = useState(thisMonthJst());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [newFor, setNewFor] = useState<string | null>(() => new URLSearchParams(location.search).get("new"));
  const [done, setDone] = useState("");

  const load = useCallback(async (m: string) => {
    setError("");
    try {
      setData(await api<Data>(`/api/liff/expenses?month=${m}`));
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
      load(month);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  if (newFor !== null && data) {
    return (
      <NewExpense
        inspections={data.inspections}
        initialInspection={newFor}
        onCancel={() => setNewFor(null)}
        onDone={() => {
          setNewFor(null);
          setDone("申請しました");
          setMonth(thisMonthJst());
          load(thisMonthJst());
        }}
      />
    );
  }

  const valid = data?.expenses.filter((e) => e.status !== "rejected") ?? [];
  const total = valid.filter((e) => e.transport === "train").reduce((s, e) => s + e.amount, 0);
  const km = Math.round(valid.reduce((s, e) => s + Number(e.distance_km ?? 0), 0) * 10) / 10;
  return (
    <main className="liff">
      <LiffHeader title="交通費申請" />
      {done && <div className="alert success">{done}</div>}
      {error && <div className="alert error">{error}</div>}
      <button className="btn primary block lg" onClick={() => setNewFor("")} disabled={!data}>
        ＋ 新しく申請する
      </button>
      <div className="row between mt" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, -1))}>
          ◀
        </button>
        <strong>
          {fmtMonth(month)}　電車 {yen(total)} ／ 車 {km} km
        </strong>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, 1))}>
          ▶
        </button>
      </div>
      {!data && !error && <p className="muted">読み込み中…</p>}
      {data?.expenses.length === 0 && <div className="card muted">この月の申請はありません。</div>}
      {data?.expenses.map((e) => (
        <div className="card" key={e.id}>
          <div className="row between">
            <strong>
              {fmtDate(e.use_date)} {e.transport === "car" ? "🚗 車" : "🚃 電車"}
            </strong>
            <span className={`badge ${BADGE[e.status]}`}>{EXPENSE_STATUS[e.status]}</span>
          </div>
          {e.links.length > 0 && (
            <div className="small">
              {e.links
                .map((l) => l.inspection?.store?.name)
                .filter(Boolean)
                .join("、")}
            </div>
          )}
          <div className="small muted">
            {e.transport === "car"
              ? `${e.route_stops.join(" → ")}${e.parking_fee ? ` ／ 駐車場 ${yen(e.parking_fee)}` : ""}${e.receipt_count ? `（レシート ${e.receipt_count} 枚）` : ""}`
              : e.train_legs.map((l) => `${l.from}→${l.to} ${yen(l.fare)}${l.round_trip ? "×往復" : ""}`).join(" ／ ")}
          </div>
          <div className="row between mt">
            <strong style={{ fontSize: 18 }}>{e.transport === "car" ? `${e.distance_km} km` : yen(e.amount)}</strong>
            {["submitted", "rejected"].includes(e.status) && (
              <button className="btn sm danger" onClick={() => withdraw(e.id)}>
                取り下げ
              </button>
            )}
          </div>
          {e.admin_comment && <div className="alert warn small mt">管理者より：{e.admin_comment}</div>}
        </div>
      ))}
    </main>
  );
}

function NewExpense({
  inspections,
  initialInspection,
  onCancel,
  onDone,
}: {
  inspections: Insp[];
  initialInspection: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { me } = useMe();
  const init = inspections.find((i) => i.id === initialInspection);
  const [date, setDate] = useState(init?.date ?? todayJst());
  const [selected, setSelected] = useState<string[]>(init ? [init.id] : []);
  const [transport, setTransport] = useState<"car" | "train">("car");
  // 車の経路：出発地 → 経由地（店舗）… → （出発地へ戻る）
  const [start, setStart] = useState(me.address);
  const [via, setVia] = useState<string[]>(init?.address ? [init.address] : [""]);
  const [returnHome, setReturnHome] = useState(true);
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

  const dayInspections = inspections.filter((i) => i.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const stops = [start, ...via, ...(returnHome ? [start] : [])].map((s) => s.trim());
  const stopsReady = stops.length >= 2 && stops.every(Boolean);

  function changeDate(d: string) {
    setDate(d);
    setSelected([]);
    setLegKm(null);
  }

  // 検査を選ぶと、その店舗の住所を経由地に（時間順で）反映
  function toggleInspection(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    const addrs = dayInspections.filter((i) => next.includes(i.id)).map((i) => i.address).filter(Boolean);
    setVia(addrs.length ? addrs : [""]);
    setLegKm(null);
    setRouteMsg("");
  }

  function setViaAt(i: number, v: string) {
    setVia((arr) => arr.map((x, j) => (j === i ? v : x)));
    setLegKm(null);
  }
  function moveVia(i: number, d: -1 | 1) {
    setVia((arr) => {
      const a = [...arr];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
    setLegKm(null);
  }

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
      for (const id of selected) fd.append("inspection_ids", id);
      if (transport === "car") {
        fd.set("distance_km", distance);
        fd.set("route_stops", JSON.stringify(stops.filter(Boolean)));
        fd.set("parking_fee", parking || "0");
        for (const f of files) fd.append("receipts", await shrinkImage(f));
      } else {
        fd.set("train_legs", JSON.stringify(legs));
      }
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
        <h1>交通費を申請</h1>
      </div>
      {error && <div className="alert error">{error}</div>}
      <form onSubmit={submit}>
        <div className="card">
          <label className="field">
            <span>利用日</span>
            <input type="date" value={date} max={todayJst()} onChange={(e) => changeDate(e.target.value)} required />
          </label>
          <div className="field">
            <span className="muted small" style={{ fontWeight: 600 }}>
              この日に回った店舗（複数選択可）
            </span>
            {dayInspections.length === 0 && <p className="small muted">この日の担当検査はありません</p>}
            {dayInspections.map((i) => (
              <label key={i.id} className={`q-choice ${selected.includes(i.id) ? "on" : ""}`}>
                <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggleInspection(i.id)} />
                <span>
                  {i.time && <span className="muted">{i.time} </span>}
                  {i.store}
                </span>
              </label>
            ))}
          </div>
          <div className="field">
            <span className="muted small" style={{ fontWeight: 600 }}>
              交通手段
            </span>
            <div className="seg" style={{ display: "flex" }}>
              <button type="button" style={{ flex: 1 }} className={transport === "car" ? "on" : ""} onClick={() => setTransport("car")}>
                🚗 車
              </button>
              <button type="button" style={{ flex: 1 }} className={transport === "train" ? "on" : ""} onClick={() => setTransport("train")}>
                🚃 電車
              </button>
            </div>
          </div>
        </div>

        {transport === "car" ? (
          <div className="card">
            <h3>経路</h3>
            <label className="field">
              <span>出発地</span>
              <input type="text" value={start} onChange={(e) => (setStart(e.target.value), setLegKm(null))} placeholder="自宅住所・駅名など" required />
            </label>
            {via.map((v, i) => (
              <div key={i} className="field">
                <span className="muted small" style={{ fontWeight: 600 }}>
                  {i + 1} 件目{legKm?.[i] !== undefined && `（前の地点から ${legKm[i]} km）`}
                </span>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input type="text" value={v} onChange={(e) => setViaAt(i, e.target.value)} placeholder="店舗の住所" required />
                  {via.length > 1 && (
                    <>
                      <button type="button" className="btn sm" onClick={() => moveVia(i, -1)} disabled={i === 0} aria-label="上へ">
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => (setVia((a) => a.filter((_, j) => j !== i)), setLegKm(null))}
                        aria-label="削除"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {via.length < 8 && (
              <button type="button" className="btn sm" onClick={() => setVia((a) => [...a, ""])}>
                ＋ 立ち寄り先を追加
              </button>
            )}
            <label className="row small mt">
              <input type="checkbox" checked={returnHome} onChange={(e) => (setReturnHome(e.target.checked), setLegKm(null))} />
              最後に出発地へ戻る
              {returnHome && legKm && legKm.length === via.length + 1 && <span className="muted">（{legKm[legKm.length - 1]} km）</span>}
            </label>

            <div className="row mt" style={{ marginBottom: 8 }}>
              {me.routeSearch && (
                <button type="button" className="btn primary" disabled={searching || !stopsReady} onClick={searchRoute}>
                  {searching ? "検索中…" : "🔍 経路検索して距離を反映"}
                </button>
              )}
              {stopsReady && (
                <a className="btn" href={mapsDirUrl(stops)} target="_blank" rel="noreferrer">
                  🗺 Googleマップで見る
                </a>
              )}
            </div>
            {routeMsg && <p className="small">{routeMsg}</p>}
            {stopsReady && embedKey && (
              <iframe
                title="経路"
                style={{ width: "100%", height: 220, border: 0, borderRadius: 8, marginBottom: 12 }}
                loading="lazy"
                src={`https://www.google.com/maps/embed/v1/directions?${new URLSearchParams({
                  key: embedKey,
                  origin: stops[0],
                  destination: stops[stops.length - 1],
                  mode: "driving",
                  ...(stops.length > 2 ? { waypoints: stops.slice(1, -1).join("|") } : {}),
                })}`}
              />
            )}
            <label className="field">
              <span>走行距離（km・合計）</span>
              <input type="number" inputMode="decimal" step="0.1" min="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} required />
            </label>
            {!me.routeSearch && <p className="muted small">Googleマップで経路を確認し、合計距離を入力してください。</p>}
            <label className="field">
              <span>駐車場代（円・ある場合のみ）</span>
              <input type="number" inputMode="numeric" min="0" value={parking} onChange={(e) => setParking(e.target.value)} placeholder="0" />
            </label>
            <label className="field">
              <span>レシート画像（任意）</span>
              <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
            </label>
            {files.length > 0 && <p className="small muted">{files.length} 枚選択中</p>}
          </div>
        ) : (
          <div className="card">
            {legs.map((l, i) => (
              <div key={i} style={{ borderBottom: i < legs.length - 1 ? "1px solid var(--border)" : undefined, paddingBottom: 8, marginBottom: 8 }}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input type="text" placeholder="乗車駅" value={l.from} onChange={(e) => setLeg(i, { from: e.target.value })} required />
                  <span>→</span>
                  <input type="text" placeholder="降車駅" value={l.to} onChange={(e) => setLeg(i, { to: e.target.value })} required />
                </div>
                <div className="row mt" style={{ flexWrap: "nowrap" }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    placeholder="運賃（円）"
                    value={l.fare || ""}
                    onChange={(e) => setLeg(i, { fare: Number(e.target.value) })}
                    required
                  />
                  <label className="row nowrap small">
                    <input type="checkbox" checked={l.round_trip} onChange={(e) => setLeg(i, { round_trip: e.target.checked })} /> 往復
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
          <label className="field">
            <span>備考</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row between">
            <span>{transport === "car" ? "走行距離" : "申請金額"}</span>
            <strong style={{ fontSize: 22 }}>
              {transport === "car" ? `${distance || 0} km${Number(parking) > 0 ? ` ＋ 駐車場 ${yen(Number(parking))}` : ""}` : yen(trainTotal(legs))}
            </strong>
          </div>
        </div>
        <button className="btn primary block lg" disabled={busy}>
          {busy ? "送信中…" : "申請する"}
        </button>
      </form>
    </main>
  );
}
