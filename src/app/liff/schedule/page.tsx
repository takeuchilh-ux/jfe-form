"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import { api, errMsg } from "@/lib/client";
import { fmtDate, fmtMonth, shiftMonth, thisMonthJst, todayJst } from "@/lib/format";

type Item = {
  id: string;
  date: string;
  time: string;
  status: string;
  notes: string;
  role: string;
  store: { name: string; area: string; address: string } | null;
  partners: string[];
};

export default function SchedulePage() {
  const { me } = useMe();
  const [month, setMonth] = useState(() => new URLSearchParams(location.search).get("month") ?? thisMonthJst());
  const [items, setItems] = useState<Item[] | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [offer, setOffer] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);

  // 研修生：同行を申し込める月があれば案内
  useEffect(() => {
    if (me.kind !== "trainee") return;
    api<{ period: { year_month: string; open: boolean } | null }>("/api/liff/offers")
      .then((r) => r.period?.open && setOffer(r.period.year_month))
      .catch(() => {});
  }, [me.kind]);

  const load = useCallback(() => {
    setItems(null);
    api<{ items: Item[] }>(`/api/liff/schedule?month=${month}`)
      .then((r) => setItems(r.items))
      .catch((e) => setMsg({ type: "error", text: errMsg(e) }));
  }, [month]);
  useEffect(load, [load]);

  const today = todayJst();
  const canEdit = (i: Item) => me.kind === "inspector" && i.role !== "trainee" && i.status === "open" && i.date >= today;

  return (
    <main className="liff">
      <LiffHeader title="マイスケジュール" />
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, -1))}>
          ◀
        </button>
        <strong>{fmtMonth(month)}</strong>
        <button className="btn sm" onClick={() => setMonth(shiftMonth(month, 1))}>
          ▶
        </button>
      </div>
      {offer && (
        <Link href={`/liff/offers?month=${offer}`} className="card" style={{ display: "block", borderLeft: "4px solid var(--warn)", color: "var(--text)" }}>
          🙋 <strong>{fmtMonth(offer)}</strong>の同行を申し込めます
          <span style={{ float: "right" }}>›</span>
        </Link>
      )}
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {!items && !msg && <p className="muted">読み込み中…</p>}
      {items?.length === 0 && (
        <div className="card muted">
          この月の予定はありません。
          {me.kind === "trainee" && (
            <>
              <br />
              <Link href="/liff/offers">同行の申し込みはこちら</Link>
            </>
          )}
        </div>
      )}
      {items?.map((i) => (
        <div key={i.id} className="card" style={{ opacity: i.date < today || i.status === "cancelled" ? 0.6 : 1 }}>
          <div className="row between">
            <strong>
              {fmtDate(i.date)} {i.time}
            </strong>
            <span className="row" style={{ gap: 4 }}>
              {i.role === "trainee" && <span className="badge info">同行</span>}
              {i.status === "cancelled" && <span className="badge ng">中止</span>}
              {i.status === "completed" && <span className="badge ok">完了</span>}
              {i.date === today && i.status === "open" && <span className="badge info">本日</span>}
            </span>
          </div>
          <div style={{ fontSize: 16, marginTop: 4 }}>{i.store?.name}</div>
          {i.store?.address && (
            <a className="small" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.store.address)}`} target="_blank" rel="noreferrer">
              📍 {i.store.address}
            </a>
          )}
          {i.partners.length > 0 && <div className="small mt">{i.role === "trainee" ? "担当・同行" : "同行"}：{i.partners.join("、")}</div>}
          {i.notes && <div className="small muted">{i.notes}</div>}
          <div className="row mt">
            {canEdit(i) && (
              <button className="btn sm" onClick={() => (setMsg(null), setEditing(i))}>
                ✏️ 日時を変更
              </button>
            )}
            {i.date <= today && i.status !== "cancelled" && (
              <Link className="btn sm" href={`/liff/expenses?new=${i.id}`}>
                交通費を申請
              </Link>
            )}
          </div>
        </div>
      ))}

      {editing && (
        <EditDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={(text, newMonth) => {
            setEditing(null);
            setMsg({ type: "success", text });
            if (newMonth !== month) setMonth(newMonth);
            else load();
          }}
        />
      )}
    </main>
  );
}

function EditDialog({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: (text: string, month: string) => void }) {
  const [date, setDate] = useState(item.date);
  // "9:30〜" ⇔ 時刻入力の "09:30"
  const [time, setTime] = useState(item.time.replace(/〜$/, "").trim().replace(/^(\d):/, "0$1:"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const timeSlot = time.trim() ? `${time.trim().replace(/^0(\d):/, "$1:")}〜` : "";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/liff/schedule/${item.id}`, { method: "PATCH", body: { date, time: timeSlot } });
      onSaved(`${item.store?.name} を ${fmtDate(date)} ${timeSlot} に変更しました`, date.slice(0, 7));
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>日時を変更</h2>
        <p className="small">
          <strong>{item.store?.name}</strong>
          <br />
          <span className="muted">
            現在：{fmtDate(item.date)} {item.time}
          </span>
        </p>
        {error && <div className="alert error">{error}</div>}
        <label className="field">
          <span>日付</span>
          <input type="date" min={todayJst()} value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="field">
          <span>開始時間</span>
          <input type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <p className="small muted">変更すると管理者に「変更あり」と表示されます。同行の研修生がいる場合も、同じ日時に変わります。</p>
        <div className="row">
          <button className="btn primary" disabled={busy || (date === item.date && timeSlot === item.time)}>
            {busy ? "保存中…" : "変更する"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
}
