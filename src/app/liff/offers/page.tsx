"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { api, errMsg } from "@/lib/client";
import { fmtDate, fmtMonth } from "@/lib/format";

type Item = {
  id: string;
  date: string;
  time: string;
  notes: string;
  store: { name: string; area: string; address: string } | null;
  answer: "yes" | "no" | null;
  comment: string;
  assigned: boolean;
};
type Data = {
  periods: { year_month: string; open: boolean }[];
  period: { year_month: string; deadline: string | null; open: boolean } | null;
  inspections: Item[];
};

export default function OffersPage() {
  const [month, setMonth] = useState(() => new URLSearchParams(location.search).get("month") ?? "");
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, "yes" | "no" | null>>({});
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (m: string) => {
    setMsg(null);
    try {
      const d = await api<Data>(`/api/liff/offers${m ? `?month=${m}` : ""}`);
      setData(d);
      setDraft({});
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    }
  }, []);

  useEffect(() => {
    load(month);
  }, [load, month]);

  const current = (i: Item) => (i.id in draft ? draft[i.id] : i.answer);
  const changed = useMemo(() => Object.keys(draft).filter((id) => data?.inspections.find((i) => i.id === id)?.answer !== draft[id]), [draft, data]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/liff/offers", { body: { answers: changed.map((id) => ({ inspection_id: id, answer: draft[id] })) } });
      await load(month);
      setMsg({ type: "success", text: "回答を送信しました。ありがとうございます！" });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  function setAll(answer: "yes" | "no") {
    if (!data) return;
    const next: Record<string, "yes" | "no"> = {};
    for (const i of data.inspections) if (current(i) === null) next[i.id] = answer;
    setDraft((d) => ({ ...d, ...next }));
  }

  if (!data) return <main className="liff">{msg ? <div className={`alert ${msg.type}`}>{msg.text}</div> : <p className="muted">読み込み中…</p>}</main>;

  const open = data.period?.open ?? false;
  const unanswered = data.inspections.filter((i) => current(i) === null).length;
  let lastDate = "";

  return (
    <main className="liff">
      <LiffHeader title="受注可否の回答" />
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {data.periods.length > 1 && (
        <div className="seg" style={{ marginBottom: 12 }}>
          {data.periods.map((p) => (
            <button key={p.year_month} className={p.year_month === data.period?.year_month ? "on" : ""} onClick={() => setMonth(p.year_month)}>
              {fmtMonth(p.year_month)}
            </button>
          ))}
        </div>
      )}
      {!data.period ? (
        <div className="card muted">現在、回答受付中のスケジュールはありません。</div>
      ) : (
        <>
          <div className="card">
            <strong>{fmtMonth(data.period.year_month)}</strong>
            {data.period.deadline && <span className="muted">　回答期限 {fmtDate(data.period.deadline)}</span>}
            <div className="mt">
              {open ? (
                <span className="muted">
                  対応できる検査は「可」、難しい検査は「不可」を選んで送信してください。未回答 <strong>{unanswered}</strong> 件
                </span>
              ) : (
                <span className="badge warn">回答受付は終了しました</span>
              )}
            </div>
            {open && unanswered > 0 && (
              <div className="row mt">
                <button className="btn sm" onClick={() => setAll("no")}>
                  未回答をすべて「不可」
                </button>
              </div>
            )}
          </div>

          {data.inspections.map((i) => {
            const head = i.date !== lastDate ? fmtDate(i.date) : null;
            lastDate = i.date;
            const a = current(i);
            return (
              <div key={i.id}>
                {head && <div className="day-head">{head}</div>}
                <div className="card" style={{ borderLeft: i.id in draft && i.answer !== draft[i.id] ? "4px solid var(--warn)" : undefined }}>
                  <div className="row between" style={{ alignItems: "flex-start" }}>
                    <div className="grow">
                      <strong>{i.store?.name}</strong>
                      {i.assigned && <span className="badge ok"> 担当確定</span>}
                      <div className="muted small">
                        {i.time && `${i.time}　`}
                        {i.store?.area}
                      </div>
                      {i.notes && <div className="small">{i.notes}</div>}
                    </div>
                    <div className="seg">
                      <button className={a === "yes" ? "on-yes" : ""} disabled={!open} onClick={() => setDraft((d) => ({ ...d, [i.id]: a === "yes" ? null : "yes" }))}>
                        可
                      </button>
                      <button className={a === "no" ? "on-no" : ""} disabled={!open} onClick={() => setDraft((d) => ({ ...d, [i.id]: a === "no" ? null : "no" }))}>
                        不可
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {open && (
            <div className="sticky-foot">
              <button className="btn primary block lg" disabled={busy || changed.length === 0} onClick={save}>
                {busy ? "送信中…" : changed.length ? `回答を送信（${changed.length} 件）` : "変更はありません"}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
