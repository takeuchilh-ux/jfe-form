import MonthNav from "@/components/MonthNav";
import { getInspections, getPeriod, listInspectors, listStores } from "@/lib/data";
import { monthParam } from "@/lib/month";
import SchedulesClient from "./SchedulesClient";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SchedulesPage({ searchParams }: Props) {
  const month = await monthParam(searchParams);
  const [period, stores, inspectors] = await Promise.all([getPeriod(month), listStores(true), listInspectors()]);
  const inspections = period ? await getInspections(period.id) : [];
  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>検査スケジュール登録</h1>
        <MonthNav month={month} base="/admin/schedules" />
      </div>
      <SchedulesClient
        key={month}
        month={month}
        period={period}
        inspections={inspections}
        stores={stores}
        inspectorNames={Object.fromEntries(inspectors.map((i) => [i.id, i.name]))}
        linkedCount={inspectors.filter((i) => i.active && i.approved_at && i.line_user_id).length}
      />
    </>
  );
}
