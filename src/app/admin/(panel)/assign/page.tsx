import Link from "next/link";
import MonthNav from "@/components/MonthNav";
import { getInspections, getPeriod, listInspectors } from "@/lib/data";
import { monthParam } from "@/lib/month";
import { fmtMonth } from "@/lib/format";
import AssignClient from "./AssignClient";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AssignPage({ searchParams }: Props) {
  const month = await monthParam(searchParams);
  const [period, inspectors] = await Promise.all([getPeriod(month), listInspectors()]);
  const inspections = period ? (await getInspections(period.id)).filter((i) => i.status !== "cancelled") : [];
  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>アサイン</h1>
        <MonthNav month={month} base="/admin/assign" />
      </div>
      {!period ? (
        <div className="card">
          {fmtMonth(month)}のスケジュールがありません。<Link href={`/admin/schedules?month=${month}`}>スケジュール登録へ</Link>
        </div>
      ) : (
        <AssignClient
          key={month}
          periodId={period.id}
          periodStatus={period.status}
          inspections={inspections}
          inspectors={inspectors
            .filter((i) => i.approved_at)
            .map((i) => ({ id: i.id, name: i.name, active: i.active, linked: !!i.line_user_id }))}
        />
      )}
    </>
  );
}
