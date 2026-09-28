import { handle, body, isUuid, str, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { HttpError } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { thisMonthJst, todayJst, shiftMonth } from "@/lib/format";

type Period = { id: string; year_month: string; status: string; response_deadline: string | null };

function isOpen(p: Period) {
  return p.status === "released" && (!p.response_deadline || p.response_deadline >= todayJst());
}

/** リリース済みの月と、その月の検査一覧＋自分の回答 */
export const GET = handle(async (req: Request) => {
  const me = await currentInspector();
  const periods = must(
    await db()
      .from("kensa_periods")
      .select("id,year_month,status,response_deadline")
      .in("status", ["released", "closed"])
      .gte("year_month", shiftMonth(thisMonthJst(), -1))
      .order("year_month"),
  ) as Period[];
  const q = new URL(req.url).searchParams.get("month");
  const period = periods.find((p) => p.year_month === q) ?? periods.find(isOpen) ?? periods[periods.length - 1];
  if (!period) return { periods: [], period: null, inspections: [] };

  const rows = must(
    await db()
      .from("kensa_inspections")
      .select(
        "id,inspection_date,time_slot,notes,status,store:kensa_stores(name,area,address)," +
          "availabilities:kensa_availabilities(answer,comment,inspector_id),assignments:kensa_assignments(inspector_id)",
      )
      .eq("period_id", period.id)
      .neq("status", "cancelled")
      .eq("availabilities.inspector_id", me.id)
      .eq("assignments.inspector_id", me.id)
      .order("inspection_date")
      .order("time_slot"),
  ) as unknown as {
    id: string;
    inspection_date: string;
    time_slot: string;
    notes: string;
    store: { name: string; area: string; address: string } | null;
    availabilities: { answer: string; comment: string }[];
    assignments: unknown[];
  }[];

  return {
    periods: periods.map((p) => ({ year_month: p.year_month, open: isOpen(p) })),
    period: { year_month: period.year_month, deadline: period.response_deadline, open: isOpen(period) },
    inspections: rows.map((r) => ({
      id: r.id,
      date: r.inspection_date,
      time: r.time_slot,
      notes: r.notes,
      store: r.store,
      answer: r.availabilities[0]?.answer ?? null,
      comment: r.availabilities[0]?.comment ?? "",
      assigned: r.assignments.length > 0,
    })),
  };
});

/** 受注可否の回答を保存（answer: "yes" | "no" | null=取消） */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector();
  const b = await body<{ answers?: { inspection_id?: unknown; answer?: unknown; comment?: unknown }[] }>(req);
  const answers = (b.answers ?? []).filter((a) => isUuid(a.inspection_id));
  if (!answers.length) bad("回答がありません");
  if (answers.length > 500) bad("回答が多すぎます");

  const ids = answers.map((a) => a.inspection_id as string);
  const inspections = must(
    await db().from("kensa_inspections").select("id,status,period:kensa_periods(id,year_month,status,response_deadline)").in("id", ids),
  ) as unknown as { id: string; status: string; period: Period }[];
  if (inspections.length !== new Set(ids).size) bad("存在しない検査が含まれています");
  for (const i of inspections) {
    if (!isOpen(i.period)) throw new HttpError(400, "回答受付は終了しています");
  }

  const upserts = answers
    .filter((a) => a.answer === "yes" || a.answer === "no")
    .map((a) => ({ inspection_id: a.inspection_id as string, inspector_id: me.id, answer: a.answer as string, comment: str(a.comment, 300) }));
  const removes = answers.filter((a) => a.answer === null).map((a) => a.inspection_id as string);

  if (upserts.length) must(await db().from("kensa_availabilities").upsert(upserts, { onConflict: "inspection_id,inspector_id" }));
  if (removes.length) must(await db().from("kensa_availabilities").delete().eq("inspector_id", me.id).in("inspection_id", removes).select("id"));
  return { saved: upserts.length + removes.length };
});
