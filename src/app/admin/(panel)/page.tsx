import Link from "next/link";
import { db } from "@/lib/supabase";
import { getInspections, getPeriod, mainAssignees } from "@/lib/data";
import { fmtMonth, PERIOD_STATUS, shiftMonth, thisMonthJst } from "@/lib/format";

export default async function Dashboard() {
  const months = [thisMonthJst(), shiftMonth(thisMonthJst(), 1)];
  const summaries = await Promise.all(
    months.map(async (m) => {
      const p = await getPeriod(m);
      const list = p ? (await getInspections(p.id)).filter((i) => i.status !== "cancelled") : [];
      return {
        month: m,
        period: p,
        total: list.length,
        unassigned: list.filter((i) => mainAssignees(i).length < i.required_count).length,
        unnotified: list.reduce((n, i) => n + i.assignments.filter((a) => !a.notified_at).length, 0),
      };
    }),
  );
  const [{ count: pendingExpenses }, { count: unlinked }, { count: pendingTests }] = await Promise.all([
    db().from("kensa_expenses").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    db().from("kensa_inspectors").select("id", { count: "exact", head: true }).eq("active", true).is("approved_at", null),
    db().from("kensa_test_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return (
    <>
      <h1>ダッシュボード</h1>
      <div className="stat-grid">
        <Link href="/admin/expenses?status=submitted" className="stat">
          <div className="num">{pendingExpenses ?? 0}</div>
          <div className="lbl">未処理の交通費申請</div>
        </Link>
        <Link href="/admin/inspectors" className="stat">
          <div className="num">{unlinked ?? 0}</div>
          <div className="lbl">承認待ちの検査員</div>
        </Link>
        <Link href="/admin/tests?tab=requests" className="stat">
          <div className="num">{pendingTests ?? 0}</div>
          <div className="lbl">本番テストの申請（承認待ち）</div>
        </Link>
      </div>
      {summaries.map((s) => (
        <div className="card" key={s.month}>
          <div className="row between">
            <h2 style={{ margin: 0 }}>
              {fmtMonth(s.month)}{" "}
              <span className={`badge ${s.period?.status === "released" ? "ok" : ""}`}>
                {s.period ? PERIOD_STATUS[s.period.status] : "未作成"}
              </span>
            </h2>
            <div className="row">
              <Link className="btn sm" href={`/admin/schedules?month=${s.month}`}>
                スケジュール
              </Link>
              <Link className="btn sm primary" href={`/admin/assign?month=${s.month}`}>
                アサイン
              </Link>
            </div>
          </div>
          <div className="row mt" style={{ gap: 24 }}>
            <div>
              検査件数 <strong>{s.total}</strong>
            </div>
            <div>
              担当未確定 <strong style={{ color: s.unassigned ? "var(--danger)" : undefined }}>{s.unassigned}</strong>
            </div>
            <div>
              未通知のアサイン <strong style={{ color: s.unnotified ? "var(--warn)" : undefined }}>{s.unnotified}</strong>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
