"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import { EXPENSE_STATUS, fmtDate, yen } from "@/lib/format";
import { mapsDirUrl, type TrainLeg } from "@/lib/expense";

export type ExpenseRow = {
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
  receipt_paths: string[];
  inspector: { name: string } | null;
  links: { inspection: { time_slot: string; store: { name: string } | null } | null }[];
};

const BADGE: Record<string, string> = { submitted: "info", approved: "ok", rejected: "ng", paid: "" };

export default function ExpensesClient({ rows }: { rows: ExpenseRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<ExpenseRow | null>(null);
  const [urls, setUrls] = useState<string[] | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    const m = new Map<string, { count: number; amount: number; km: number }>();
    for (const r of rows) {
      if (r.status === "rejected") continue;
      const k = r.inspector?.name ?? "?";
      const t = m.get(k) ?? { count: 0, amount: 0, km: 0 };
      m.set(k, { count: t.count + 1, amount: t.amount + r.amount, km: t.km + Number(r.distance_km ?? 0) });
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));
  }, [rows]);

  async function show(r: ExpenseRow) {
    setOpen(r);
    setComment(r.admin_comment);
    setError("");
    setUrls(null);
    if (r.receipt_paths.length) {
      try {
        setUrls((await api<{ urls: string[] }>(`/api/admin/expenses/${r.id}/receipts`)).urls);
      } catch (e) {
        setError(errMsg(e));
      }
    }
  }

  const [edit, setEdit] = useState<{ use_date: string; distance_km: string; parking_fee: string; amount: string; note: string } | null>(null);

  async function send(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setOpen(null);
      setEdit(null);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const update = (status: string) => open && send(() => api(`/api/admin/expenses/${open.id}`, { method: "PATCH", body: { status, admin_comment: comment } }));

  function startEdit(r: ExpenseRow) {
    setEdit({
      use_date: r.use_date,
      distance_km: String(r.distance_km ?? ""),
      parking_fee: String(r.parking_fee ?? 0),
      amount: String(r.amount),
      note: r.note,
    });
  }

  function saveEdit() {
    if (!open || !edit) return;
    const body: Record<string, unknown> = { use_date: edit.use_date, note: edit.note };
    if (open.transport === "car") Object.assign(body, { distance_km: Number(edit.distance_km), parking_fee: Number(edit.parking_fee || 0) });
    else body.amount = Number(edit.amount);
    send(() => api(`/api/admin/expenses/${open.id}`, { method: "PATCH", body }));
  }

  function remove() {
    if (!open || !confirm("この交通費申請を削除しますか？（レシート画像も削除されます）")) return;
    send(() => api(`/api/admin/expenses/${open.id}`, { method: "DELETE" }));
  }

  return (
    <>
      {totals.length > 0 && (
        <div className="card">
          <h3>検査員別合計（差戻し除く）</h3>
          <div className="chips">
            {totals.map(([name, t]) => (
              <span key={name} className="chip no" style={{ color: "var(--text)", cursor: "default" }}>
                {name}：{t.count} 件 <strong>{yen(t.amount)}</strong>{t.km > 0 && <> ／ 車 <strong>{Math.round(t.km * 10) / 10}km</strong></>}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>利用日</th>
              <th>検査員</th>
              <th>店舗</th>
              <th>手段</th>
              <th>内訳</th>
              <th className="right">金額</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  申請はありません
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDate(r.use_date)}</td>
                <td className="nowrap">{r.inspector?.name}</td>
                <td>{storeNames(r) || <span className="muted">—</span>}</td>
                <td>{r.transport === "car" ? "🚗 車" : "🚃 電車"}</td>
                <td className="small">
                  <Detail r={r} />
                </td>
                <td className="right nowrap">
                  <strong>{yen(r.amount)}</strong>
                </td>
                <td>
                  <span className={`badge ${BADGE[r.status]}`}>{EXPENSE_STATUS[r.status]}</span>
                </td>
                <td>
                  <button className="btn sm" onClick={() => show(r)}>
                    確認
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modal-back" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {open.inspector?.name} ／ {fmtDate(open.use_date)} <span className={`badge ${BADGE[open.status]}`}>{EXPENSE_STATUS[open.status]}</span>
            </h2>
            {error && <div className="alert error">{error}</div>}
            <p>店舗：{storeNames(open) || "（指定なし）"}</p>
            <p>
              <Detail r={open} />
            </p>
            <p>
              金額：<strong>{yen(open.amount)}</strong>
            </p>
            {open.note && <p className="muted">備考：{open.note}</p>}
            {open.receipt_paths.length > 0 && (
              <div className="receipts">
                <h3>レシート（{open.receipt_paths.length} 枚）</h3>
                {!urls && <p className="muted">読み込み中…</p>}
                {urls?.map((u, i) =>
                  open.receipt_paths[i]?.endsWith(".pdf") || open.receipt_paths[i]?.match(/\.hei[cf]$/) ? (
                    <p key={u}>
                      <a href={u} target="_blank" rel="noreferrer">
                        添付ファイル {i + 1} を開く
                      </a>
                    </p>
                  ) : (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt={`レシート ${i + 1}`} />
                    </a>
                  ),
                )}
              </div>
            )}
            <label className="field mt">
              <span>検査員へのコメント（差戻し理由など）</span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => update("approved")}>
                承認
              </button>
              <button className="btn danger" disabled={busy} onClick={() => update("rejected")}>
                差戻し
              </button>
              <button className="btn" disabled={busy} onClick={() => update("paid")}>
                支払済にする
              </button>
              <span className="grow" />
              <button className="btn" onClick={() => (setOpen(null), setEdit(null))}>
                閉じる
              </button>
            </div>
            <div className="row mt" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              {!edit && (
                <button className="btn sm" disabled={busy} onClick={() => startEdit(open)}>
                  内容を修正
                </button>
              )}
              <span className="grow" />
              <button className="btn sm danger" disabled={busy} onClick={remove}>
                削除
              </button>
            </div>
            {edit && (
              <div className="card mt">
                <h3>内容を修正</h3>
                <label className="field">
                  <span>利用日</span>
                  <input type="date" value={edit.use_date} onChange={(e) => setEdit({ ...edit, use_date: e.target.value })} />
                </label>
                {open.transport === "car" ? (
                  <div className="row">
                    <label className="field grow">
                      <span>走行距離（km）</span>
                      <input type="number" step="0.1" min="0" value={edit.distance_km} onChange={(e) => setEdit({ ...edit, distance_km: e.target.value })} />
                    </label>
                    <label className="field grow">
                      <span>駐車場代（円）</span>
                      <input type="number" min="0" value={edit.parking_fee} onChange={(e) => setEdit({ ...edit, parking_fee: e.target.value })} />
                    </label>
                  </div>
                ) : (
                  <label className="field">
                    <span>金額（円）</span>
                    <input type="number" min="0" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />
                  </label>
                )}
                <label className="field">
                  <span>備考</span>
                  <input type="text" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
                </label>
                <div className="row">
                  <button className="btn primary" disabled={busy} onClick={saveEdit}>
                    修正を保存
                  </button>
                  <button className="btn" onClick={() => setEdit(null)}>
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function storeNames(r: ExpenseRow) {
  return r.links
    .map((l) => l.inspection?.store?.name)
    .filter(Boolean)
    .join("、");
}

function Detail({ r }: { r: ExpenseRow }) {
  if (r.transport === "car") {
    return (
      <>
        <strong>{r.distance_km}km</strong>
        {r.parking_fee > 0 && ` ／ 駐車場 ${yen(r.parking_fee)}`}
        {r.route_stops.length >= 2 && (
          <div>
            <a href={mapsDirUrl(r.route_stops)} target="_blank" rel="noreferrer">
              {r.route_stops.join(" → ")}
            </a>
          </div>
        )}
        {r.receipt_paths.length > 0 && " 🧾"}
      </>
    );
  }
  return (
    <>
      {r.train_legs.map((l, i) => (
        <div key={i}>
          {l.from}→{l.to} {yen(l.fare)}
          {l.round_trip && "（往復）"}
        </div>
      ))}
    </>
  );
}
