"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, errMsg, parseCsv } from "@/lib/client";
import { fmtDate, fmtMonth, PERIOD_STATUS } from "@/lib/format";
import type { InspectionRow, Period, Store } from "@/lib/data";

type Props = {
  month: string;
  period: Period | null;
  inspections: InspectionRow[];
  stores: Store[];
  inspectorNames: Record<string, string>;
  linkedCount: number;
};

type Draft = { store_id: string; inspection_date: string; time_slot: string; required_count: number; notes: string };

export default function SchedulesClient({ month, period, inspections, stores, inspectorNames, linkedCount }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: "error" | "success" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<InspectionRow | null>(null);
  const [showBulk, setShowBulk] = useState(false);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ type: "success", text });
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
      // エラー時も最新の状態を表示する
      router.refresh();
    }
  }

  if (!period) {
    return (
      <div className="card">
        <p>{fmtMonth(month)}のスケジュールはまだ作成されていません。</p>
        <button className="btn primary" disabled={busy} onClick={() => run(async () => void (await api("/api/admin/periods", { body: { month } })))}>
          {fmtMonth(month)}のスケジュールを作成
        </button>
      </div>
    );
  }

  const active = inspections.filter((i) => i.status !== "cancelled");

  async function release() {
    const again = period!.status !== "draft";
    const ok = confirm(
      `${fmtMonth(month)}のスケジュール（${active.length} 件）を、承認済みの検査員 ${linkedCount} 名へ LINE で${again ? "再" : ""}通知します。よろしいですか？`,
    );
    if (!ok) return;
    await run(async () => {
      const r = await api<{ sent: number; lineError: string | null }>(`/api/admin/periods/${period!.id}/release`, { method: "POST" });
      if (r.lineError) throw new Error(`リリースしましたが LINE 送信に失敗しました：${r.lineError}`);
      return `リリースしました（LINE 送信 ${r.sent} 名）`;
    });
  }

  return (
    <>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <div className="row between">
          <div className="row">
            <span className={`badge ${period.status === "released" ? "ok" : period.status === "closed" ? "warn" : ""}`}>
              {PERIOD_STATUS[period.status]}
            </span>
            <span className="muted">
              検査 {active.length} 件{period.released_at && ` ／ 最終リリース ${new Date(period.released_at).toLocaleString("ja-JP")}`}
            </span>
          </div>
          <div className="row">
            <DeadlineEditor period={period} busy={busy} run={run} />
            <button className="btn primary" disabled={busy || !active.length} onClick={release}>
              📣 {period.status === "draft" ? "検査員へリリース" : "再通知"}
            </button>
            {period.status === "released" && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => run(async () => void (await api(`/api/admin/periods/${period.id}`, { method: "PATCH", body: { status: "closed" } })))}
              >
                回答を締め切る
              </button>
            )}
            {period.status === "closed" && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => run(async () => void (await api(`/api/admin/periods/${period.id}`, { method: "PATCH", body: { status: "released" } })))}
              >
                回答を再開
              </button>
            )}
            <Link className="btn" href={`/admin/assign?month=${month}`}>
              アサインへ →
            </Link>
          </div>
        </div>
        <div className="row mt" style={{ justifyContent: "flex-end" }}>
          {period.status !== "draft" && (
            <button
              className="btn sm"
              disabled={busy}
              onClick={() =>
                confirm("下書き（未リリース）の状態に戻しますか？（検査員の回答・アサインはそのまま残ります）") &&
                run(async () => void (await api(`/api/admin/periods/${period.id}`, { method: "PATCH", body: { status: "draft" } })))
              }
            >
              下書きに戻す
            </button>
          )}
          <button
            className="btn sm danger"
            disabled={busy}
            onClick={() =>
              confirm(`${fmtMonth(month)}のスケジュールを丸ごと削除します。\n検査 ${inspections.length} 件と、その受注可否の回答・アサインもすべて削除されます。\n\n削除しますか？`) &&
              run(async () => {
                await api(`/api/admin/periods/${period.id}`, { method: "DELETE" });
                return `${fmtMonth(month)}のスケジュールを削除しました`;
              })
            }
          >
            この月のスケジュールを削除
          </button>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>検査を追加</h2>
          <button className="btn sm" onClick={() => setShowBulk((v) => !v)}>
            {showBulk ? "1 件ずつ登録" : "CSV で一括登録"}
          </button>
        </div>
        <div className="mt">
          {showBulk ? (
            <BulkAdd month={month} periodId={period.id} stores={stores} busy={busy} run={run} />
          ) : (
            <InspectionForm
              month={month}
              stores={stores}
              busy={busy}
              submitLabel="追加"
              onSubmit={(d) => run(async () => void (await api("/api/admin/inspections", { body: { period_id: period.id, items: [d] } })))}
            />
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日付</th>
              <th>時間</th>
              <th>店舗</th>
              <th>エリア</th>
              <th className="right">人数</th>
              <th>回答（可/不可）</th>
              <th>担当</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inspections.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  検査が登録されていません
                </td>
              </tr>
            )}
            {inspections.map((i) => {
              const yes = i.availabilities.filter((a) => a.answer === "yes").length;
              const no = i.availabilities.length - yes;
              return (
                <tr key={i.id} className={i.status === "cancelled" ? "dim" : ""}>
                  <td className="nowrap">{fmtDate(i.inspection_date)}</td>
                  <td className="nowrap">{i.time_slot}</td>
                  <td>
                    {i.store?.name}
                    {i.status === "cancelled" && <span className="badge ng"> 中止</span>}
                    {i.status === "completed" && <span className="badge ok"> 完了</span>}
                    {i.notes && <div className="muted small">{i.notes}</div>}
                  </td>
                  <td className="nowrap">{i.store?.area}</td>
                  <td className="right">{i.required_count}</td>
                  <td className="nowrap">
                    <span className="badge ok">{yes}</span> / <span className="badge">{no}</span>
                  </td>
                  <td>
                    {i.assignments.map((a) => `${inspectorNames[a.inspector_id] ?? "?"}${a.role === "trainee" ? "（同行）" : ""}`).join("、") || (
                      <span className="muted">未定</span>
                    )}
                  </td>
                  <td className="nowrap">
                    <button className="btn sm" onClick={() => setEditing(i)}>
                      編集
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>検査を編集</h2>
            <InspectionForm
              month={month}
              stores={stores}
              busy={busy}
              initial={editing}
              submitLabel="保存"
              onSubmit={(d) =>
                run(async () => {
                  await api(`/api/admin/inspections/${editing.id}`, { method: "PATCH", body: d });
                  setEditing(null);
                })
              }
            />
            <div className="row mt" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              {(["open", "completed", "cancelled"] as const)
                .filter((s) => s !== editing.status)
                .map((s) => (
                  <button
                    key={s}
                    className={`btn sm ${s === "cancelled" ? "danger" : ""}`}
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api(`/api/admin/inspections/${editing.id}`, { method: "PATCH", body: { status: s } });
                        setEditing(null);
                      })
                    }
                  >
                    {{ open: "予定に戻す", completed: "完了にする", cancelled: "中止にする" }[s]}
                  </button>
                ))}
              <span className="grow" />
              <button
                className="btn sm danger"
                disabled={busy}
                onClick={() => {
                  if (!confirm("この検査を削除します。回答・アサインも削除されます。よろしいですか？")) return;
                  run(async () => {
                    await api(`/api/admin/inspections/${editing.id}`, { method: "DELETE" });
                    setEditing(null);
                  });
                }}
              >
                削除
              </button>
              <button className="btn sm" onClick={() => setEditing(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DeadlineEditor({ period, busy, run }: { period: Period; busy: boolean; run: (fn: () => Promise<string | void>) => void }) {
  const [value, setValue] = useState(period.response_deadline ?? "");
  const changed = value !== (period.response_deadline ?? "");
  return (
    <div className="row">
      <span className="muted">回答期限</span>
      <input type="date" className="inline" value={value} onChange={(e) => setValue(e.target.value)} />
      {changed && (
        <button
          className="btn sm"
          disabled={busy}
          onClick={() => run(async () => void (await api(`/api/admin/periods/${period.id}`, { method: "PATCH", body: { response_deadline: value || null } })))}
        >
          保存
        </button>
      )}
    </div>
  );
}

function StoreSelect({ stores, value, onChange }: { stores: Store[]; value: string; onChange: (v: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, Store[]>();
    for (const s of stores) {
      const k = s.area || "（エリア未設定）";
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()];
  }, [stores]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">店舗を選択</option>
      {groups.map(([area, list]) => (
        <optgroup key={area} label={area}>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function InspectionForm(props: {
  month: string;
  stores: Store[];
  busy: boolean;
  initial?: InspectionRow;
  submitLabel: string;
  onSubmit: (d: Draft) => void;
}) {
  const init = props.initial;
  const [d, setD] = useState<Draft>({
    store_id: init?.store_id ?? "",
    inspection_date: init?.inspection_date ?? `${props.month}-01`,
    time_slot: init?.time_slot ?? "",
    required_count: init?.required_count ?? 1,
    notes: init?.notes ?? "",
  });
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const [y, m] = props.month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit(d);
        if (!init) setD((p) => ({ ...p, store_id: "", notes: "" }));
      }}
    >
      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field grow" style={{ minWidth: 220 }}>
          <span>店舗</span>
          <StoreSelect stores={props.stores} value={d.store_id} onChange={(v) => set("store_id", v)} />
        </label>
        <label className="field">
          <span>日付</span>
          <input
            type="date"
            value={d.inspection_date}
            min={`${props.month}-01`}
            max={`${props.month}-${String(last).padStart(2, "0")}`}
            onChange={(e) => set("inspection_date", e.target.value)}
            required
          />
        </label>
        <label className="field" style={{ width: 140 }}>
          <span>時間帯</span>
          <input type="text" placeholder="例: 10:00〜" value={d.time_slot} onChange={(e) => set("time_slot", e.target.value)} />
        </label>
        <label className="field" style={{ width: 80 }}>
          <span>人数</span>
          <input type="number" min={1} max={10} value={d.required_count} onChange={(e) => set("required_count", Number(e.target.value))} />
        </label>
      </div>
      <label className="field">
        <span>備考（検査員にも表示されます）</span>
        <input type="text" value={d.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>
      <button className="btn primary" disabled={props.busy}>
        {props.submitLabel}
      </button>
    </form>
  );
}

function BulkAdd({ month, periodId, stores, busy, run }: { month: string; periodId: string; stores: Store[]; busy: boolean; run: (fn: () => Promise<string | void>) => void }) {
  const [text, setText] = useState("");
  const byName = useMemo(() => new Map(stores.map((s) => [s.name.replace(/\s/g, ""), s.id])), [stores]);
  const parsed = useMemo(() => {
    const rows = parseCsv(text).filter((r) => !/^日付/.test(r[0] ?? ""));
    return rows.map((r) => {
      const date = normalizeDate(r[0] ?? "", month);
      const storeId = byName.get((r[1] ?? "").replace(/\s/g, ""));
      const error = !date ? "日付が不正" : !date.startsWith(month) ? "対象月外" : !storeId ? "店舗名が未登録" : "";
      return { raw: r, error, item: { inspection_date: date, store_id: storeId, time_slot: r[2] ?? "", required_count: Number(r[3]) || 1, notes: r[4] ?? "" } };
    });
  }, [text, byName, month]);
  const errors = parsed.filter((p) => p.error);
  return (
    <>
      <p className="muted">
        1 行 1 検査で「日付,店舗名,時間帯,人数,備考」の順に貼り付けてください（Excel からのコピーも可）。店舗名は店舗マスタと完全一致が必要です。
      </p>
      <textarea
        rows={8}
        value={text}
        placeholder={`${month}-05,博多劇場 川﨑店,10:00〜,1,\n${month}-06,じねんじょ庵 青葉台店,14:00〜,2,研修同行あり`}
        onChange={(e) => setText(e.target.value)}
      />
      {parsed.length > 0 && (
        <p className="mt">
          {parsed.length} 行を認識{errors.length > 0 && <span style={{ color: "var(--danger)" }}>（エラー {errors.length} 行）</span>}
        </p>
      )}
      {errors.slice(0, 10).map((e, i) => (
        <div key={i} className="small" style={{ color: "var(--danger)" }}>
          {e.raw.join(", ")} … {e.error}
        </div>
      ))}
      <button
        className="btn primary mt"
        disabled={busy || !parsed.length || errors.length > 0}
        onClick={() =>
          run(async () => {
            const r = await api<{ count: number }>("/api/admin/inspections", { body: { period_id: periodId, items: parsed.map((p) => p.item) } });
            setText("");
            return `${r.count} 件登録しました`;
          })
        }
      >
        一括登録
      </button>
    </>
  );
}

/** "2026/10/5", "10/5", "2026-10-05" などを "YYYY-MM-DD" に */
function normalizeDate(s: string, month: string) {
  const t = s.replace(/[年月]/g, "/").replace(/日/g, "").replace(/-/g, "/").trim();
  const parts = t.split("/").map((x) => Number(x));
  let y: number, m: number, d: number;
  if (parts.length === 3) [y, m, d] = parts;
  else if (parts.length === 2) [y, m, d] = [Number(month.slice(0, 4)), parts[0], parts[1]];
  else return "";
  if (!y || !m || !d || m > 12 || d > 31) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
