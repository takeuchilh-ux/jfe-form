"use client";

import { useCallback, useEffect, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import { api, errMsg } from "@/lib/client";
import { fmtDate, fmtMonth } from "@/lib/format";

type Item = {
  id: string;
  date: string;
  time: string;
  notes: string;
  store: { name: string; area: string; address: string } | null;
  inspectors: string[];
  trainees: string[];
  slots: number;
  joined: boolean;
  past: boolean;
};
type Data = {
  periods: { year_month: string; open: boolean }[];
  period: { year_month: string; deadline: string | null; open: boolean } | null;
  inspections: Item[];
};

/** 研修生：公開された検査（担当検査員が決まったもの）から、同行する日を選ぶ */
export default function OffersPage() {
  const { me } = useMe();
  const [month, setMonth] = useState(() => new URLSearchParams(location.search).get("month") ?? "");
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  const load = useCallback(async (m: string) => {
    try {
      setData(await api<Data>(`/api/liff/offers${m ? `?month=${m}` : ""}`));
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    }
  }, []);

  useEffect(() => {
    if (me.kind === "trainee") load(month);
  }, [load, month, me.kind]);

  if (me.kind !== "trainee") {
    return (
      <main className="liff">
        <LiffHeader title="同行の申し込み" />
        <div className="alert warn">この機能は研修生向けです。担当の検査は「マイスケジュール」で確認できます。</div>
      </main>
    );
  }

  async function toggle(i: Item) {
    setBusy(i.id);
    setMsg(null);
    try {
      await api("/api/liff/offers", { body: { inspection_id: i.id, join: !i.joined } });
      setMsg({ type: "success", text: `${fmtDate(i.date)} ${i.store?.name} の同行を${i.joined ? "取り消しました" : "申し込みました"}` });
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      await load(month);
      setBusy(null);
    }
  }

  if (!data) return <main className="liff">{msg ? <div className={`alert ${msg.type}`}>{msg.text}</div> : <p className="muted">読み込み中…</p>}</main>;

  const open = data.period?.open ?? false;
  const mine = data.inspections.filter((i) => i.joined).length;
  const list = onlyMine ? data.inspections.filter((i) => i.joined) : data.inspections;
  let lastDate = "";

  return (
    <main className="liff">
      <LiffHeader title="同行の申し込み" />
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
        <div className="card muted">現在、公開中のスケジュールはありません。</div>
      ) : (
        <>
          <div className="card">
            <strong>{fmtMonth(data.period.year_month)}</strong>
            {data.period.deadline && <span className="muted">　申込締切 {fmtDate(data.period.deadline)}</span>}
            <div className="mt small">
              {open ? (
                <span className="muted">同行したい検査の「同行する」を押してください。前日まで取り消せます。</span>
              ) : (
                <span className="badge warn">申し込みの受付は終了しました</span>
              )}
            </div>
            <div className="row between mt">
              <span>
                同行予定 <strong>{mine}</strong> 件
              </span>
              <label className="row small">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> 申し込んだものだけ表示
              </label>
            </div>
          </div>

          {list.length === 0 && <div className="card muted">表示する検査はありません。</div>}
          {list.map((i) => {
            const head = i.date !== lastDate ? fmtDate(i.date) : null;
            lastDate = i.date;
            const full = !i.joined && i.trainees.length >= i.slots;
            const closed = !open || i.past;
            return (
              <div key={i.id}>
                {head && <div className="day-head">{head}</div>}
                <div className="card" style={{ borderLeft: i.joined ? "4px solid var(--primary)" : undefined, opacity: i.past ? 0.6 : 1 }}>
                  <div className="row between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
                    <div className="grow">
                      <strong>{i.store?.name}</strong>
                      <div className="muted small">
                        {i.time && `${i.time}　`}
                        {i.store?.area}
                      </div>
                      <div className="small">担当：{i.inspectors.join("、") || "未定"}</div>
                      {i.trainees.length > 0 && <div className="small muted">同行：{i.trainees.join("、")}</div>}
                      {i.notes && <div className="small muted">{i.notes}</div>}
                    </div>
                    {i.slots <= 0 && !i.joined ? (
                      <span className="badge">同行不可</span>
                    ) : full ? (
                      <span className="badge">満員</span>
                    ) : (
                      <button
                        className={`btn sm ${i.joined ? "" : "primary"}`}
                        style={{ whiteSpace: "nowrap" }}
                        disabled={closed || busy !== null}
                        onClick={() => toggle(i)}
                      >
                        {busy === i.id ? "…" : i.joined ? "✓ 同行予定（取消）" : "同行する"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </main>
  );
}
