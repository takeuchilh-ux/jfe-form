"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, errMsg, parseCsv } from "@/lib/client";
import CsvTools from "@/components/CsvTools";
import { fmtDate, fmtMonth, PERIOD_STATUS } from "@/lib/format";
import type { InspectionRow, Period, Store } from "@/lib/data";

type Props = {
  month: string;
  period: Period | null;
  inspections: InspectionRow[];
  stores: Store[];
  inspectorNames: Record<string, string>;
  traineeCount: number;
};

type Draft = { store_id: string; inspection_date: string; time_slot: string; required_count: number; trainee_slots: number; notes: string };

export default function SchedulesClient({ month, period, inspections, stores, inspectorNames, traineeCount }: Props) {
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

  const changed = inspections.filter((i) => !i.change_seen);

  async function release() {
    if (period!.status === "draft" && !confirm(`${fmtMonth(month)}のスケジュール（${active.length} 件）を研修生に公開し、同行の申し込みを受け付けます。よろしいですか？`)) return;
    const notify = confirm(`研修生 ${traineeCount} 名に LINE で「同行の申し込み受付中」とお知らせしますか？\n（キャンセルを押すと、お知らせせずに公開します）`);
    await run(async () => {
      const r = await api<{ sent: number; lineError: string | null }>(`/api/admin/periods/${period!.id}/release`, { body: { notify } });
      if (r.lineError) throw new Error(`公開しましたが LINE 送信に失敗しました：${r.lineError}`);
      return notify ? `研修生に公開しました（LINE 送信 ${r.sent} 名）` : "研修生に公開しました";
    });
  }

  const seen = (id: string) => run(async () => void (await api(`/api/admin/inspections/${id}`, { method: "PATCH", body: { change_seen: true } })));

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
              検査 {active.length} 件{period.released_at && ` ／ 公開 ${new Date(period.released_at).toLocaleString("ja-JP")}`}
            </span>
          </div>
          <div className="row">
            <DeadlineEditor period={period} busy={busy} run={run} />
            <button className="btn primary" disabled={busy || !active.length} onClick={release}>
              🙋 {period.status === "draft" ? "研修生に公開" : "研修生へ再度お知らせ"}
            </button>
            {period.status === "released" && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => run(async () => void (await api(`/api/admin/periods/${period.id}`, { method: "PATCH", body: { status: "closed" } })))}
              >
                同行の受付を締め切る
              </button>
            )}
            {period.status === "closed" && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => run(async () => void (await api(`/api/admin/periods/${period.id}`, { method: "PATCH", body: { status: "released" } })))}
              >
                同行の受付を再開
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
                confirm("研修生に非公開の状態に戻しますか？（申し込み済みの同行・アサインはそのまま残ります）") &&
                run(async () => void (await api(`/api/admin/periods/${period.id}`, { method: "PATCH", body: { status: "draft" } })))
              }
            >
              非公開に戻す
            </button>
          )}
          <button
            className="btn sm danger"
            disabled={busy}
            onClick={() =>
              confirm(`${fmtMonth(month)}のスケジュールを丸ごと削除します。\n検査 ${inspections.length} 件と、そのアサイン（同行を含む）もすべて削除されます。\n\n削除しますか？`) &&
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

      {changed.length > 0 && (
        <div className="alert warn">
          検査員が日時を変更した検査が {changed.length} 件あります（一覧の「⚠ 変更あり」）。内容を確認したら「確認済み」を押してください。
        </div>
      )}

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>検査を追加</h2>
          <button className="btn sm" onClick={() => setShowBulk((v) => !v)}>
            {showBulk ? "1 件ずつ登録" : "JFE の予定表を取り込む（CSV）"}
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
              <th>担当</th>
              <th>同行（研修生）</th>
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
              const names = (role: "main" | "trainee") =>
                i.assignments
                  .filter((a) => (a.role === "trainee") === (role === "trainee"))
                  .map((a) => inspectorNames[a.inspector_id] ?? "?")
                  .join("、");
              const trainees = i.assignments.filter((a) => a.role === "trainee").length;
              return (
                <tr key={i.id} className={i.status === "cancelled" ? "dim" : ""} style={i.change_seen ? undefined : { background: "var(--warn-bg, #fff7e0)" }}>
                  <td className="nowrap">{fmtDate(i.inspection_date)}</td>
                  <td className="nowrap">{i.time_slot}</td>
                  <td>
                    {i.store?.name}
                    {i.status === "cancelled" && <span className="badge ng"> 中止</span>}
                    {i.status === "completed" && <span className="badge ok"> 完了</span>}
                    {i.notes && <div className="muted small">{i.notes}</div>}
                    {i.change_note && (
                      <div className="small" style={{ whiteSpace: "pre-line", color: i.change_seen ? "var(--muted)" : "var(--warn, #b26b00)" }}>
                        {!i.change_seen && <strong>⚠ 変更あり　</strong>}
                        {i.change_note}
                      </div>
                    )}
                  </td>
                  <td className="nowrap">{i.store?.area}</td>
                  <td>{names("main") || <span className="muted">未定</span>}</td>
                  <td className="small">
                    {names("trainee")}
                    <span className="muted">
                      {i.trainee_slots === 0 ? "同行不可" : `（${trainees}/${i.trainee_slots}）`}
                    </span>
                  </td>
                  <td className="nowrap">
                    {!i.change_seen && (
                      <button className="btn sm primary" style={{ marginRight: 4 }} disabled={busy} onClick={() => seen(i.id)}>
                        確認済み
                      </button>
                    )}
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
                  if (!confirm("この検査を削除します。アサイン（同行を含む）も削除されます。よろしいですか？")) return;
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
      <span className="muted">同行の申込締切</span>
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
    trainee_slots: init?.trainee_slots ?? 1,
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
        <label className="field" style={{ width: 120 }}>
          <span>同行枠（研修生）</span>
          <select value={d.trainee_slots} onChange={(e) => set("trainee_slots", Number(e.target.value))}>
            <option value={0}>同行不可</option>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} 名
              </option>
            ))}
          </select>
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

/** 見出しの名前から列を探す（JFE の予定表の列の並びが変わっても取り込めるように） */
const COLS = {
  store: ["店舗", "店舗名"],
  date: ["訪問日", "日付", "検査日"],
  time: ["時間", "時間帯", "開始"],
  main: ["担当", "検査員"],
  trainee: ["研修生", "同行"],
  address: ["住所"],
  group: ["グループ名", "運営会社", "会社"],
  notes: ["備考", "メモ"],
} as const;

function BulkAdd({ month, periodId, busy, run }: { month: string; periodId: string; stores: Store[]; busy: boolean; run: (fn: () => Promise<string | void>) => void }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => {
    const all = parseCsv(text).filter((r) => r.some((c) => c.trim()));
    const hi = all.findIndex((r) => r.some((c) => COLS.date.includes(c.trim() as never)) && r.some((c) => COLS.store.includes(c.trim() as never)));
    if (hi < 0) return { error: all.length ? "見出し行（店舗・訪問日 など）が見つかりません。1 行目に見出しを入れてください" : "", rows: [] };
    const header = all[hi].map((c) => c.trim());
    const col = (k: keyof typeof COLS) => header.findIndex((h) => (COLS[k] as readonly string[]).includes(h));
    const idx = Object.fromEntries((Object.keys(COLS) as (keyof typeof COLS)[]).map((k) => [k, col(k)])) as Record<keyof typeof COLS, number>;
    const get = (r: string[], k: keyof typeof COLS) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    const rows = all
      .slice(hi + 1)
      .filter((r) => get(r, "store") || get(r, "date"))
      .map((r) => {
        const date = normalizeDate(get(r, "date"), month);
        const error = !get(r, "store") ? "店舗名がない" : !date ? "日付が不正" : !date.startsWith(month) ? "対象月外" : "";
        // JFE の表の「同行不可」はどの列にあっても同行枠 0 とみなす
        const noTrainee = r.some((c) => c.trim() === "同行不可");
        return {
          raw: r,
          error,
          item: {
            date,
            time: get(r, "time") && !/〜$/.test(get(r, "time")) ? `${get(r, "time")}〜` : get(r, "time"),
            store: get(r, "store"),
            address: get(r, "address"),
            group: get(r, "group"),
            main: get(r, "main"),
            trainee: get(r, "trainee"),
            notes: idx.notes >= 0 && !/^同行(可能|不可)$/.test(get(r, "notes")) ? get(r, "notes") : "",
            trainee_slots: noTrainee ? 0 : "",
          },
        };
      });
    return { error: "", rows };
  }, [text, month]);
  const errors = parsed.rows.filter((p) => p.error);
  return (
    <>
      <p className="muted">
        JFE から届いた予定表（店舗・訪問日・時間・担当・研修生・住所）を、見出し行ごと貼り付けるか CSV ファイルを選んでください。列の順番は問いません。
      </p>
      <ul className="small muted" style={{ marginTop: 0 }}>
        <li>担当・研修生は名前（名字だけでも可）で検査員に自動でアサインします。登録されていない名前は取り込まれません</li>
        <li>未登録の店舗は、住所・グループ名つきで自動登録します</li>
        <li>同じ店舗・同じ日の検査が既にあれば、時間を更新し、足りない担当だけ追加します</li>
        <li>「同行不可」と書かれた行は研修生が申し込めません</li>
      </ul>
      <CsvTools
        filename={`検査スケジュール_${month}.csv`}
        template={[
          ["店舗", "訪問日", "時間", "担当", "研修生", "住所", "グループ名", "備考"],
          ["〇〇食堂 横浜駅前店", `${month}-05`, "10:00", "児林", "", "神奈川県横浜市西区〇〇1-2-3", "株式会社〇〇", ""],
          ["△△ラーメン 川崎店", `${month}-06`, "14:00", "吉田", "", "神奈川県川崎市川崎区〇〇2-3-4", "", "同行不可"],
        ]}
        onLoad={setText}
      />
      <textarea rows={8} value={text} placeholder={"店舗,訪問日,時間,担当,研修生,住所\n七宝麻辣湯綱島店,2026年10月6日,10:00,児林,,神奈川県横浜市港北区…"} onChange={(e) => setText(e.target.value)} />
      {parsed.error && <p className="small" style={{ color: "var(--danger)" }}>{parsed.error}</p>}
      {parsed.rows.length > 0 && (
        <p className="mt">
          {parsed.rows.length} 行を認識{errors.length > 0 && <span style={{ color: "var(--danger)" }}>（エラー {errors.length} 行）</span>}
        </p>
      )}
      {errors.slice(0, 10).map((e, i) => (
        <div key={i} className="small" style={{ color: "var(--danger)" }}>
          {e.raw.join(", ")} … {e.error}
        </div>
      ))}
      <button
        className="btn primary mt"
        disabled={busy || !parsed.rows.length || errors.length > 0}
        onClick={() =>
          run(async () => {
            const r = await api<{ added: number; updated: number; assigned: number; newStores: string[]; unknownNames: string[] }>("/api/admin/inspections/import", {
              body: { period_id: periodId, rows: parsed.rows.map((p) => p.item) },
            });
            setText("");
            const parts = [`新規 ${r.added} 件・更新 ${r.updated} 件を取り込み、${r.assigned} 名をアサインしました`];
            if (r.newStores.length) parts.push(`店舗を追加：${r.newStores.join("、")}`);
            if (r.unknownNames.length) parts.push(`未登録のためアサインしなかった名前：${r.unknownNames.join("、")}`);
            return parts.join("／");
          })
        }
      >
        取り込む
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
