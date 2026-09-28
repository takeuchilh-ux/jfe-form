"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { InspectionRow } from "@/lib/data";

type Insp = { id: string; name: string; active: boolean; linked: boolean; kind: "inspector" | "trainee" };

export default function AssignClient({
  periodId,
  periodStatus,
  inspections,
  inspectors,
}: {
  periodId: string;
  periodStatus: string;
  inspections: InspectionRow[];
  inspectors: Insp[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: "error" | "success" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const byId = useMemo(() => new Map(inspectors.map((i) => [i.id, i])), [inspectors]);
  const name = (id: string) => byId.get(id)?.name ?? "?";
  const isTrainee = (id: string) => byId.get(id)?.kind === "trainee";

  // 担当件数・同日重複
  const load = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of inspections) for (const a of i.assignments) m.set(a.inspector_id, (m.get(a.inspector_id) ?? 0) + 1);
    return m;
  }, [inspections]);
  const sameDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of inspections)
      for (const a of i.assignments) {
        const k = `${i.inspection_date}|${a.inspector_id}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    return m;
  }, [inspections]);

  const mainCount = (i: InspectionRow) => i.assignments.filter((a) => a.role !== "trainee").length;
  const unnotified = inspections.reduce((n, i) => n + i.assignments.filter((a) => !a.notified_at).length, 0);
  const unfilled = inspections.filter((i) => mainCount(i) < i.required_count).length;
  const list = onlyOpen ? inspections.filter((i) => mainCount(i) < i.required_count) : inspections;

  async function setAssign(ins: InspectionRow, ids: string[]) {
    setBusy(ins.id);
    setMsg(null);
    try {
      await api("/api/admin/assignments", { method: "PUT", body: { inspection_id: ins.id, inspector_ids: ids } });
      router.refresh();
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  async function notify() {
    if (!confirm(`未通知のアサイン ${unnotified} 件を、担当の検査員・研修生へ LINE で通知します。よろしいですか？`)) return;
    setBusy("notify");
    setMsg(null);
    try {
      const r = await api<{ sent: number; skipped: string[]; errors: string[] }>(`/api/admin/periods/${periodId}/notify`, { method: "POST" });
      const parts = [`${r.sent} 名に通知しました`];
      if (r.skipped.length) parts.push(`LINE 未連携のため未送信：${r.skipped.join("、")}`);
      if (r.errors.length) parts.push(`送信エラー：${r.errors.join(" / ")}`);
      setMsg({ type: r.errors.length || r.skipped.length ? "warn" : "success", text: parts.join("／") });
      router.refresh();
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(null);
    }
  }

  const people = inspectors.filter((i) => i.active);
  let lastDate = "";
  return (
    <>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {periodStatus === "draft" && <div className="alert warn">この月はまだ検査員へリリースされていません（受注可否の回答がありません）。</div>}

      <div className="card row between">
        <div className="row">
          <span>
            検査 <strong>{inspections.length}</strong> 件
          </span>
          <span>
            担当未確定 <strong style={{ color: unfilled ? "var(--danger)" : undefined }}>{unfilled}</strong> 件
          </span>
          <label className="row small">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> 未確定のみ表示
          </label>
        </div>
        <button className="btn primary" disabled={!unnotified || busy !== null} onClick={notify}>
          ✉️ 確定を LINE 通知（未通知 {unnotified} 件）
        </button>
      </div>

      <div className="card">
        <h3>今月の担当件数</h3>
        {(["inspector", "trainee"] as const).map((k) => (
          <div key={k} className="row" style={{ marginTop: 6, alignItems: "flex-start" }}>
            <span className="muted small" style={{ width: 70, paddingTop: 4 }}>
              {k === "inspector" ? "検査員" : "研修生"}
            </span>
            <div className="chips grow">
              {people.filter((i) => i.kind === k).length === 0 && <span className="muted small">—</span>}
              {people
                .filter((i) => i.kind === k)
                .map((i) => (
                  <span key={i.id} className="chip no" style={{ cursor: "default", color: "var(--text)" }}>
                    {i.name} <strong>{load.get(i.id) ?? 0}</strong>
                    {!i.linked && <span className="badge warn">LINE未連携</span>}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {list.map((ins) => {
        const assigned = ins.assignments.map((a) => a.inspector_id);
        const yes = ins.availabilities.filter((a) => a.answer === "yes");
        const no = ins.availabilities.filter((a) => a.answer === "no");
        const head = ins.inspection_date !== lastDate ? fmtDate(ins.inspection_date) : null;
        lastDate = ins.inspection_date;
        const main = mainCount(ins);
        const filled = main >= ins.required_count;
        const toggle = (id: string) => setAssign(ins, assigned.includes(id) ? assigned.filter((x) => x !== id) : [...assigned, id]);

        const section = (kind: "inspector" | "trainee") => {
          const trainee = kind === "trainee";
          const yesK = yes.filter((a) => isTrainee(a.inspector_id) === trainee);
          const extra = assigned.filter((id) => isTrainee(id) === trainee && !yes.some((y) => y.inspector_id === id));
          const others = people.filter((i) => i.kind === kind && !assigned.includes(i.id) && !yes.some((y) => y.inspector_id === i.id));
          return (
            <div className="mt">
              <div className="muted small">{trainee ? "同行（研修生）：受注可" : "検査員：受注可（クリックでアサイン）"}</div>
              <div className="chips" style={{ marginTop: 4 }}>
                {yesK.length === 0 && extra.length === 0 && <span className="muted small">まだいません</span>}
                {yesK.map((a) => (
                  <span
                    key={a.inspector_id}
                    className={`chip ${assigned.includes(a.inspector_id) ? "on" : ""}`}
                    onClick={() => busy === null && toggle(a.inspector_id)}
                    title={a.comment}
                  >
                    {assigned.includes(a.inspector_id) ? "✓ " : ""}
                    {name(a.inspector_id)}
                    <small>（{load.get(a.inspector_id) ?? 0}件）</small>
                    {(sameDay.get(`${ins.inspection_date}|${a.inspector_id}`) ?? 0) > (assigned.includes(a.inspector_id) ? 1 : 0) && (
                      <span className="badge warn">同日他件</span>
                    )}
                    {a.comment && " 💬"}
                  </span>
                ))}
                {extra.map((id) => (
                  <span key={id} className="chip on" onClick={() => busy === null && toggle(id)}>
                    ✓ {name(id)}（例外アサイン）
                  </span>
                ))}
                <select
                  className="inline"
                  style={{ minHeight: 30, fontSize: 13, padding: "2px 8px" }}
                  value=""
                  disabled={busy !== null}
                  onChange={(e) => e.target.value && setAssign(ins, [...assigned, e.target.value])}
                >
                  <option value="">＋ 回答以外の{trainee ? "研修生" : "検査員"}を追加…</option>
                  {others.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {no.some((n) => n.inspector_id === i.id) ? "（受注不可と回答）" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        };

        const trainees = ins.assignments.filter((a) => a.role === "trainee").length;
        return (
          <div key={ins.id}>
            {head && <div className="day-head">{head}</div>}
            <div className="card" style={{ opacity: busy === ins.id ? 0.6 : 1, borderLeft: `4px solid ${filled ? "var(--primary)" : "var(--danger)"}` }}>
              <div className="row between">
                <div>
                  <strong>{ins.store?.name}</strong> <span className="muted">{ins.time_slot}</span> <span className="badge">{ins.store?.area}</span>
                  {ins.notes && <div className="muted small">{ins.notes}</div>}
                </div>
                <div className="row">
                  <span className={`badge ${filled ? "ok" : "ng"}`}>
                    検査員 {main} / {ins.required_count} 名
                  </span>
                  {trainees > 0 && <span className="badge info">同行 {trainees} 名</span>}
                </div>
              </div>
              {section("inspector")}
              {section("trainee")}
              {no.length > 0 && <div className="muted small mt">受注不可：{no.map((a) => name(a.inspector_id)).join("、")}</div>}
              {ins.assignments.some((a) => a.notified_at) && <div className="muted small">通知済みあり</div>}
            </div>
          </div>
        );
      })}
    </>
  );
}
