import { handle, body, isUuid, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { HttpError } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { thisMonthJst, todayJst, shiftMonth } from "@/lib/format";
import { isTraineeOpen } from "@/lib/schedule";

type Period = { id: string; year_month: string; status: string; response_deadline: string | null };
type Row = {
  id: string;
  inspection_date: string;
  time_slot: string;
  notes: string;
  trainee_slots: number;
  store: { name: string; area: string; address: string } | null;
  assignments: { role: string; inspector: { id: string; name: string } | null }[];
};

/** 公開中の月の検査一覧（担当検査員・同行の空き・自分が同行するか）。研修生向け */
export const GET = handle(async (req: Request) => {
  const me = await currentInspector({ only: "trainee" });
  const periods = must(
    await db()
      .from("kensa_periods")
      .select("id,year_month,status,response_deadline")
      .in("status", ["released", "closed"])
      .gte("year_month", shiftMonth(thisMonthJst(), -1))
      .order("year_month"),
  ) as Period[];
  const q = new URL(req.url).searchParams.get("month");
  const period = periods.find((p) => p.year_month === q) ?? periods.find(isTraineeOpen) ?? periods[periods.length - 1];
  if (!period) return { periods: [], period: null, inspections: [] };

  const rows = must(
    await db()
      .from("kensa_inspections")
      .select("id,inspection_date,time_slot,notes,trainee_slots,store:kensa_stores(name,area,address),assignments:kensa_assignments(role,inspector:kensa_inspectors(id,name))")
      .eq("period_id", period.id)
      .eq("status", "open")
      .order("inspection_date")
      .order("time_slot"),
  ) as unknown as Row[];

  const today = todayJst();
  return {
    periods: periods.map((p) => ({ year_month: p.year_month, open: isTraineeOpen(p) })),
    period: { year_month: period.year_month, deadline: period.response_deadline, open: isTraineeOpen(period) },
    inspections: rows.map((r) => {
      const trainees = r.assignments.filter((a) => a.role === "trainee" && a.inspector);
      const joined = trainees.some((a) => a.inspector!.id === me.id);
      return {
        id: r.id,
        date: r.inspection_date,
        time: r.time_slot,
        notes: r.notes,
        store: r.store,
        inspectors: r.assignments.filter((a) => a.role !== "trainee" && a.inspector).map((a) => a.inspector!.name),
        trainees: trainees.filter((a) => a.inspector!.id !== me.id).map((a) => a.inspector!.name),
        slots: r.trainee_slots,
        joined,
        past: r.inspection_date <= today,
      };
    }),
  };
});

/** 同行の申し込み（join: true）／取り消し（join: false）。前日まで変更できる */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector({ only: "trainee" });
  const b = await body<{ inspection_id?: unknown; join?: unknown }>(req);
  if (!isUuid(b.inspection_id)) bad("検査が不正です");
  const ins = must(
    await db()
      .from("kensa_inspections")
      .select("id,inspection_date,status,trainee_slots,period:kensa_periods(status,response_deadline),assignments:kensa_assignments(inspector_id,role)")
      .eq("id", b.inspection_id)
      .single(),
  ) as unknown as {
    id: string;
    inspection_date: string;
    status: string;
    trainee_slots: number;
    period: { status: string; response_deadline: string | null };
    assignments: { inspector_id: string; role: string }[];
  };
  if (!isTraineeOpen(ins.period)) throw new HttpError(400, "同行の受付は終了しています");
  if (ins.status !== "open" || ins.inspection_date <= todayJst()) throw new HttpError(400, "この検査は変更できません（前日まで変更できます）");
  const mine = ins.assignments.some((a) => a.inspector_id === me.id);

  if (b.join) {
    if (mine) return { ok: true };
    if (ins.trainee_slots <= 0) throw new HttpError(400, "この検査は同行できません");
    const taken = ins.assignments.filter((a) => a.role === "trainee").length;
    if (taken >= ins.trainee_slots) throw new HttpError(409, "同行の枠が埋まりました。別の日を選んでください");
    must(await db().from("kensa_assignments").insert({ inspection_id: ins.id, inspector_id: me.id, role: "trainee" }).select("id"));
    // 同時に申し込まれて枠を超えた場合は取り消す
    const { count } = await db().from("kensa_assignments").select("id", { count: "exact", head: true }).eq("inspection_id", ins.id).eq("role", "trainee");
    if ((count ?? 0) > ins.trainee_slots) {
      must(await db().from("kensa_assignments").delete().eq("inspection_id", ins.id).eq("inspector_id", me.id).select("id"));
      throw new HttpError(409, "同行の枠が埋まりました。別の日を選んでください");
    }
  } else if (mine) {
    must(await db().from("kensa_assignments").delete().eq("inspection_id", ins.id).eq("inspector_id", me.id).eq("role", "trainee").select("id"));
  }
  return { ok: true };
});
