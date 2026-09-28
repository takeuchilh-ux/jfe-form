import { handle, isMonth } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must } from "@/lib/supabase";
import { monthRange, thisMonthJst } from "@/lib/format";

/** 自分にアサインされた検査（月別） */
export const GET = handle(async (req: Request) => {
  const me = await currentInspector();
  const q = new URL(req.url).searchParams.get("month");
  const month = isMonth(q) ? q : thisMonthJst();
  const { start, end } = monthRange(month);
  const rows = must(
    await db()
      .from("kensa_assignments")
      .select(
        "inspection:kensa_inspections!inner(id,inspection_date,time_slot,status,notes,store:kensa_stores(name,area,address)," +
          "assignments:kensa_assignments(role,inspector:kensa_inspectors(id,name)))",
      )
      .eq("inspector_id", me.id)
      .gte("inspection.inspection_date", start)
      .lt("inspection.inspection_date", end),
  ) as unknown as {
    inspection: {
      id: string;
      inspection_date: string;
      time_slot: string;
      status: string;
      notes: string;
      store: { name: string; area: string; address: string } | null;
      assignments: { role: string; inspector: { id: string; name: string } | null }[];
    };
  }[];
  const items = rows
    .map(({ inspection: i }) => ({
      id: i.id,
      date: i.inspection_date,
      time: i.time_slot,
      status: i.status,
      notes: i.notes,
      store: i.store,
      partners: i.assignments
        .filter((a) => a.inspector && a.inspector.id !== me.id)
        .map((a) => `${a.inspector!.name}${a.role === "trainee" ? "（研修）" : ""}`),
    }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return { month, items };
});
