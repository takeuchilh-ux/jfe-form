import { handle, isMonth, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { EXPENSE_STATUS, monthRange } from "@/lib/format";
import type { TrainLeg } from "@/lib/expense";

type Row = {
  use_date: string;
  transport: string;
  distance_km: number | null;
  route_stops: string[];
  parking_fee: number;
  train_legs: TrainLeg[];
  amount: number;
  note: string;
  status: string;
  inspector: { name: string } | null;
  links: { inspection: { store: { name: string } | null } | null }[];
};

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 月別の交通費一覧 CSV（Excel で開けるよう BOM 付き） */
export const GET = handle(async (req: Request) => {
  await requireAdmin();
  const month = new URL(req.url).searchParams.get("month");
  if (!isMonth(month)) bad("month を指定してください");
  const { start, end } = monthRange(month);
  const rows = must(
    await db()
      .from("kensa_expenses")
      .select("use_date,transport,distance_km,route_stops,parking_fee,train_legs,amount,note,status,inspector:kensa_inspectors(name),links:kensa_expense_inspections(inspection:kensa_inspections(store:kensa_stores(name)))")
      .gte("use_date", start)
      .lt("use_date", end)
      .order("use_date"),
  ) as unknown as Row[];
  const header = ["利用日", "検査員", "店舗", "交通手段", "距離(km)", "経路", "駐車場代", "電車区間", "金額(電車運賃/駐車場代)", "状態", "備考"];
  const lines = rows.map((r) =>
    [
      r.use_date,
      r.inspector?.name,
      r.links.map((l) => l.inspection?.store?.name).filter(Boolean).join("、"),
      r.transport === "car" ? "車" : "電車",
      r.distance_km ?? "",
      r.transport === "car" ? r.route_stops.join("→") : "",
      r.transport === "car" ? r.parking_fee : "",
      (r.train_legs ?? []).map((l) => `${l.from}→${l.to} ${l.fare}円${l.round_trip ? "(往復)" : ""}`).join(" / "),
      r.amount,
      EXPENSE_STATUS[r.status] ?? r.status,
      r.note,
    ]
      .map(csvCell)
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...lines].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expenses-${month}.csv"`,
    },
  });
});
