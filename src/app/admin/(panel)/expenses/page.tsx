import MonthNav from "@/components/MonthNav";
import { db, must } from "@/lib/supabase";
import { monthParam } from "@/lib/month";
import { monthRange } from "@/lib/format";
import ExpensesClient, { type ExpenseRow } from "./ExpensesClient";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ExpensesPage({ searchParams }: Props) {
  const month = await monthParam(searchParams);
  const status = (await searchParams).status;
  const { start, end } = monthRange(month);
  let q = db()
    .from("kensa_expenses")
    .select(
      "id,use_date,transport,distance_km,route_from,route_to,round_trip,parking_fee,train_legs,amount,note,status,admin_comment,receipt_paths,created_at," +
        "inspector:kensa_inspectors(name),inspection:kensa_inspections(time_slot,store:kensa_stores(name))",
    )
    .order("use_date")
    .order("created_at");
  // ダッシュボードの「未処理」リンクからは月に関係なく申請中を表示
  q = status === "submitted" ? q.eq("status", "submitted") : q.gte("use_date", start).lt("use_date", end);
  const rows = must(await q) as unknown as ExpenseRow[];
  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>交通費申請{status === "submitted" && "（未処理すべて）"}</h1>
        <div className="row">
          <MonthNav month={month} base="/admin/expenses" />
          <a className="btn sm" href={`/api/admin/expenses/export?month=${month}`}>
            CSV 出力
          </a>
        </div>
      </div>
      <ExpensesClient rows={rows} />
    </>
  );
}
