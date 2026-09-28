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
  route_from: string;
  route_to: string;
  round_trip: boolean;
  parking_fee: number;
  train_legs: TrainLeg[];
  amount: number;
  note: string;
  status: string;
  admin_comment: string;
  receipt_count: number;
  inspection: { store: { name: string } | null } | null;
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
          {e.inspection?.store && <div className="small">{e.inspection.store.name}</div>}
          <div className="small muted">
            {e.transport === "car"
              ? `${e.route_from && `${e.route_from} → ${e.route_to} `}${e.round_trip ? "（往復）" : ""}${e.parking_fee ? ` ／ 駐車場 ${yen(e.parking_fee)}` : ""}${e.receipt_count ? `（レシート ${e.receipt_count} 枚）` : ""}`
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
  const [inspectionId, setInspectionId] = useState(init?.id ?? "");
  const [date, setDate] = useState(init?.date ?? todayJst());
  const [transport, setTransport] = useState<"car" | "train">("train");
  const [distance, setDistance] = useState("");
  const [routeFrom, setRouteFrom] = useState(me.address);
  const [routeTo, setRouteTo] = useState(init?.address ?? "");
  const [roundTrip, setRoundTrip] = useState(true);
  const [oneWayKm, setOneWayKm] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [routeMsg, setRouteMsg] = useState("");
  const [parking, setParking] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [legs, setLegs] = useState<TrainLeg[]>([{ from: "", to: "", fare: 0, round_trip: true }]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = trainTotal(legs);

  async function searchRoute() {
    setSearching(true);
    setRouteMsg("");
    try {
      const r = await api<{ km: number; minutes: number | null }>("/api/liff/distance", { body: { from: routeFrom, to: routeTo } });
      setOneWayKm(r.km);
      setDistance(String(roundTrip ? Math.round(r.km * 20) / 10 : r.km));
      setRouteMsg(`片道 ${r.km} km${r.minutes ? `（約 ${r.minutes} 分）` : ""}`);
    } catch (err) {
      setRouteMsg(errMsg(err));
    } finally {
      setSearching(false);
    }
  }

  function toggleRound(v: boolean) {
    setRoundTrip(v);
    if (oneWayKm !== null) setDistance(String(v ? Math.round(oneWayKm * 20) / 10 : oneWayKm));
  }

  function pickInspection(id: string) {
    setInspectionId(id);
    const i = inspections.find((x) => x.id === id);
    if (i) {
      setDate(i.date);
      if (i.address) setRouteTo(i.address);
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
      if (inspectionId) fd.set("inspection_id", inspectionId);
      if (transport === "car") {
        fd.set("distance_km", distance);
        fd.set("route_from", routeFrom);
        fd.set("route_to", routeTo);
        fd.set("round_trip", roundTrip ? "1" : "0");
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
            <span>対象の検査</span>
            <select value={inspectionId} onChange={(e) => pickInspection(e.target.value)}>
              <option value="">（選択しない）</option>
              {inspections.map((i) => (
                <option key={i.id} value={i.id}>
                  {fmtDate(i.date)} {i.store}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>利用日</span>
            <input type="date" value={date} max={todayJst()} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <div className="field">
            <span className="muted small" style={{ fontWeight: 600 }}>
              交通手段
            </span>
            <div className="seg" style={{ display: "flex" }}>
              <button type="button" style={{ flex: 1 }} className={transport === "train" ? "on" : ""} onClick={() => setTransport("train")}>
                🚃 電車
              </button>
              <button type="button" style={{ flex: 1 }} className={transport === "car" ? "on" : ""} onClick={() => setTransport("car")}>
                🚗 車
              </button>
            </div>
          </div>
        </div>

        {transport === "car" ? (
          <div className="card">
            <label className="field">
              <span>出発地</span>
              <input type="text" value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} placeholder="自宅住所・駅名など" />
            </label>
            <label className="field">
              <span>目的地</span>
              <input type="text" value={routeTo} onChange={(e) => setRouteTo(e.target.value)} placeholder="店舗の住所" />
            </label>
            <div className="row" style={{ marginBottom: 12 }}>
              {me.routeSearch && (
                <button type="button" className="btn primary" disabled={searching || !routeFrom || !routeTo} onClick={searchRoute}>
                  {searching ? "検索中…" : "🔍 経路検索して距離を反映"}
                </button>
              )}
              {routeFrom && routeTo && (
                <a className="btn" href={mapsDirUrl(routeFrom, routeTo)} target="_blank" rel="noreferrer">
                  🗺 Googleマップで見る
                </a>
              )}
            </div>
            {routeMsg && <p className="small muted">{routeMsg}</p>}
            {routeFrom && routeTo && process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY && (
              <iframe
                title="経路"
                style={{ width: "100%", height: 220, border: 0, borderRadius: 8, marginBottom: 12 }}
                loading="lazy"
                src={`https://www.google.com/maps/embed/v1/directions?${new URLSearchParams({
                  key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY,
                  origin: routeFrom,
                  destination: routeTo,
                  mode: "driving",
                })}`}
              />
            )}
            <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-end" }}>
              <label className="field grow">
                <span>走行距離（km）</span>
                <input type="number" inputMode="decimal" step="0.1" min="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} required />
              </label>
              <label className="field row nowrap">
                <input type="checkbox" checked={roundTrip} onChange={(e) => toggleRound(e.target.checked)} /> 往復
              </label>
            </div>
            {!me.routeSearch && <p className="muted small">Googleマップで経路を確認し、距離を入力してください。</p>}
            <label className="field">
              <span>駐車場代（円・ある場合のみ）</span>
              <input type="number" inputMode="numeric" min="0" value={parking} onChange={(e) => setParking(e.target.value)} placeholder="0" />
            </label>
            <label className="field">
              <span>レシート画像{Number(parking) > 0 && "（必須）"}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
                required={Number(parking) > 0}
              />
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
                    placeholder="片道運賃（円）"
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
              {transport === "car" ? `${distance || 0} km${Number(parking) > 0 ? ` ＋ 駐車場 ${yen(Number(parking))}` : ""}` : yen(amount)}
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
