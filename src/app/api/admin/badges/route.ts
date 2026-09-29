import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { shiftMonth, thisMonthJst, todayJst } from "@/lib/format";

export const dynamic = "force-dynamic";

/** メニューに表示する未処理件数（管理画面が 30 秒ごとに取得） */
export const GET = handle(async () => {
  await requireAdmin();
  const count = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  };
  const month = thisMonthJst();
  const [expenses, tests, inspectors, inspections] = await Promise.all([
    count(db().from("kensa_expenses").select("id", { count: "exact", head: true }).eq("status", "submitted")),
    count(db().from("kensa_test_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(db().from("kensa_inspectors").select("id", { count: "exact", head: true }).eq("active", true).is("approved_at", null)),
    // リリース済み（今月・来月）の、今日以降の検査と担当者
    db()
      .from("kensa_inspections")
      .select("required_count,assignments:kensa_assignments(role),period:kensa_periods!inner(year_month,status)")
      .neq("status", "cancelled")
      .gte("inspection_date", todayJst())
      .in("period.year_month", [month, shiftMonth(month, 1)])
      .in("period.status", ["released", "closed"]),
  ]);
  const unassigned = (must(inspections) as unknown as { required_count: number; assignments: { role: string }[] }[]).filter(
    (i) => i.assignments.filter((a) => a.role !== "trainee").length < i.required_count,
  ).length;
  return { expenses, tests, inspectors, assign: unassigned };
});
