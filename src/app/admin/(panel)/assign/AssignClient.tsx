"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, errMsg } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import type { InspectionRow } from "@/lib/data";

type Insp = { id: string; name: string; active: boolean; linked: boolean; kind: "inspector" | "trainee" };
type Filter = "all" | "nomain" | "free";

/**
 * 担当検査員は JFE の決定を取り込んだもの（必要なら修正）、研修生は本人の申し込み＋管理者による追加・取消。
 * LINE での確定通知はせず、前日のリマインドだけが自動で届く
 */
export default function AssignClient({
  month,
  periodStatus,
  inspections: serverInspections,
  inspectors,
}: {
  month: string;
  periodStatus: string;
  inspections: InspectionRow[];
  inspectors: Insp[];
}) {
  const router = useRouter();
  // 押した瞬間に表示へ反映するための一時的な上書き（保存・再読込が終わったら消す）
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  useEffect(() => setOverrides({}), [serverInspections]);
  const byId = useMemo(() => new Map(inspectors.map((i) => [i.id, i])), [inspectors]);
  const isTrainee = (id: string) => byId.get(id)?.kind === "trainee";
  const inspections = useMemo(
    () =>
      serverInspections.map((i) => {
        const ids = overrides[i.id];
        if (!ids) return i;
        const keep = i.assignments.filter((a) => ids.includes(a.inspector_id));
        const added = ids
          .filter((id) => !i.assignments.some((a) => a.inspector_id === id))
          .map((id) => ({ inspector_id: id, reminded_at: null, role: (byId.get(id)?.kind === "trainee" ? "trainee" : "main") as "main" | "trainee" }));
        return { ...i, assignments: [...keep, ...added] };
      }),
    [serverInspections, overrides, byId],
  );
  const [msg, setMsg] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const name = (id: string) => byId.get(id)?.name ?? "?";

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

  const mains = (i: InspectionRow) => i.assignments.filter((a) => a.role !== "trainee");
  const trainees = (i: InspectionRow) => i.assignments.filter((a) => a.role === "trainee");
  const noMain = inspections.filter((i) => mains(i).length === 0).length;
  const traineeTotal = inspections.reduce((n, i) => n + trainees(i).length, 0);
  const list = inspections.filter((i) =>
    filter === "nomain" ? mains(i).length === 0 : filter === "free" ? i.trainee_slots > trainees(i).length : true,
  );

  async function setAssign(ins: InspectionRow, ids: string[]) {
    setOverrides((o) => ({ ...o, [ins.id]: ids }));
    setMsg("");
    try {
      await api("/api/admin/assignments", { method: "PUT", body: { inspection_id: ins.id, inspector_ids: ids } });
    } catch (e) {
      setMsg(errMsg(e));
      setOverrides((o) => {
        const n = { ...o };
        delete n[ins.id];
        return n;
      });
    } finally {
      router.refresh();
    }
  }

  const people = inspectors.filter((i) => i.active);
  let lastDate = "";
  return (
    <>
      {msg && <div className="alert error">{msg}</div>}
      {periodStatus === "draft" && (
        <div className="alert warn">
          この月はまだ研修生に公開していません。<Link href={`/admin/schedules?month=${month}`}>スケジュール画面</Link>の「研修生に公開」で、研修生が同行を申し込めるようになります。
        </div>
      )}

      <div className="card row between">
        <div className="row">
          <span>
            検査 <strong>{inspections.length}</strong> 件
          </span>
          <span>
            担当未定 <strong style={{ color: noMain ? "var(--danger)" : undefined }}>{noMain}</strong> 件
          </span>
          <span>
            同行 <strong>{traineeTotal}</strong> 件
          </span>
        </div>
        <div className="seg">
          {(
            [
              ["all", "すべて"],
              ["nomain", "担当未定"],
              ["free", "同行に空き"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>今月の件数</h3>
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
        <p className="small muted" style={{ marginBottom: 0 }}>
          LINE 未連携の人には前日のリマインドが届きません。
        </p>
      </div>

      {list.length === 0 && <div className="card muted">表示する検査はありません。</div>}
      {list.map((ins) => {
        const assigned = ins.assignments.map((a) => a.inspector_id);
        const head = ins.inspection_date !== lastDate ? fmtDate(ins.inspection_date) : null;
        lastDate = ins.inspection_date;
        const m = mains(ins).length;
        const t = trainees(ins).length;

        const section = (kind: "inspector" | "trainee") => {
          const trainee = kind === "trainee";
          const mine = assigned.filter((id) => isTrainee(id) === trainee);
          const others = people.filter((i) => i.kind === kind && !assigned.includes(i.id));
          return (
            <div className="row mt" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <span className="muted small" style={{ width: 54, flexShrink: 0, paddingTop: 6 }}>
                {trainee ? "同行" : "担当"}
              </span>
              <div className="chips grow">
                {mine.map((id) => (
                  <span key={id} className="chip on" title="クリックで外す" onClick={() => confirm(`${name(id)} を外しますか？`) && setAssign(ins, assigned.filter((x) => x !== id))}>
                    ✓ {name(id)}
                    {(sameDay.get(`${ins.inspection_date}|${id}`) ?? 0) > 1 && <span className="badge warn">同日他件</span>}
                  </span>
                ))}
                {trainee && ins.trainee_slots === 0 && mine.length === 0 && <span className="muted small">同行不可</span>}
                <select
                  className="inline"
                  style={{ minHeight: 30, fontSize: 13, padding: "2px 8px" }}
                  value=""
                  onChange={(e) => e.target.value && setAssign(ins, [...assigned, e.target.value])}
                >
                  <option value="">＋ {trainee ? "研修生" : "検査員"}を追加…</option>
                  {others.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {(sameDay.get(`${ins.inspection_date}|${i.id}`) ?? 0) > 0 ? "（同日に他の予定あり）" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        };

        return (
          <div key={ins.id}>
            {head && <div className="day-head">{head}</div>}
            <div className="card" style={{ borderLeft: `4px solid ${m ? "var(--primary)" : "var(--danger)"}` }}>
              <div className="row between">
                <div>
                  <strong>{ins.store?.name}</strong> <span className="muted">{ins.time_slot}</span> {ins.store?.area && <span className="badge">{ins.store.area}</span>}
                  {ins.notes && <div className="muted small">{ins.notes}</div>}
                  {!ins.change_seen && <div className="small" style={{ color: "var(--warn, #b26b00)" }}>⚠ 検査員が日時を変更しました（スケジュール画面で確認）</div>}
                </div>
                <div className="row">
                  {!m && <span className="badge ng">担当未定</span>}
                  <span className={`badge ${t ? "info" : ""}`}>{ins.trainee_slots === 0 ? "同行不可" : `同行 ${t}/${ins.trainee_slots}`}</span>
                </div>
              </div>
              {section("inspector")}
              {section("trainee")}
            </div>
          </div>
        );
      })}
    </>
  );
}
