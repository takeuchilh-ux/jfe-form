"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LiffHeader from "@/components/LiffHeader";
import { api, errMsg } from "@/lib/client";
import { fmtDate, fmtMonth, shiftMonth, thisMonthJst, todayJst } from "@/lib/format";

type Item = {
  id: string;
  date: string;
  time: string;
  status: string;
  notes: string;
  store: { name: string; area: string; address: string } | null;
  partners: string[];
};

export default function SchedulePage() {
  const [month, setMonth] = useState(() => new URLSearchParams(location.search).get("month") ?? thisMonthJst());
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [offer, setOffer] = useState<{ month: string; unanswered: number } | null>(null);

  // 回答受付中のスケジュールがあれば案内（リッチメニューに回答ボタンがないため）
  useEffect(() => {
    api<{ period: { year_month: string; open: boolean } | null; inspections: { answer: string | null }[] }>("/api/liff/offers")
      .then((r) => {
        if (r.period?.open) setOffer({ month: r.period.year_month, unanswered: r.inspections.filter((i) => !i.answer).length });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setItems(null);
    api<{ items: Item[] }>(`/api/liff/schedule?month=${month}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError(errMsg(e)));
  }, [month]);

  const today = todayJst();
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
        <Link href={`/liff/offers?month=${offer.month}`} className="card" style={{ display: "block", borderLeft: "4px solid var(--warn)", color: "var(--text)" }}>
          📋 <strong>{fmtMonth(offer.month)}</strong>のスケジュールを回答受付中です
          {offer.unanswered > 0 ? `（未回答 ${offer.unanswered} 件）` : "（回答済み・変更できます）"}
          <span style={{ float: "right" }}>›</span>
        </Link>
      )}
      {error && <div className="alert error">{error}</div>}
      {!items && !error && <p className="muted">読み込み中…</p>}
      {items?.length === 0 && (
        <div className="card muted">
          この月の担当検査はありません。
          <br />
          <Link href="/liff/offers">受注可否の回答はこちら</Link>
        </div>
      )}
      {items?.map((i) => (
        <div key={i.id} className="card" style={{ opacity: i.date < today || i.status === "cancelled" ? 0.6 : 1 }}>
          <div className="row between">
            <strong>
              {fmtDate(i.date)} {i.time}
            </strong>
            {i.status === "cancelled" && <span className="badge ng">中止</span>}
            {i.status === "completed" && <span className="badge ok">完了</span>}
            {i.date === today && i.status === "open" && <span className="badge info">本日</span>}
          </div>
          <div style={{ fontSize: 16, marginTop: 4 }}>{i.store?.name}</div>
          {i.store?.address && (
            <a className="small" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.store.address)}`} target="_blank" rel="noreferrer">
              📍 {i.store.address}
            </a>
          )}
          {i.partners.length > 0 && <div className="small mt">同行：{i.partners.join("、")}</div>}
          {i.notes && <div className="small muted">{i.notes}</div>}
          {i.date <= today && i.status !== "cancelled" && (
            <Link className="btn sm mt" href={`/liff/expenses?new=${i.id}`}>
              交通費を申請
            </Link>
          )}
        </div>
      ))}
    </main>
  );
}
