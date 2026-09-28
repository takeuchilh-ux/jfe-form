import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { buttonMessage, liffUrl, pushMessage } from "@/lib/line";
import { fmtDate, fmtMonth } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

type Row = {
  id: string;
  inspector: { id: string; name: string; line_user_id: string | null } | null;
  inspection: { inspection_date: string; time_slot: string; status: string; store: { name: string } | null } | null;
};

/** 未通知のアサインを検査員ごとにまとめて LINE で通知する */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const period = must(await db().from("kensa_periods").select("year_month").eq("id", id).single());
  const rows = must(
    await db()
      .from("kensa_assignments")
      .select(
        "id,inspector:kensa_inspectors(id,name,line_user_id)," +
          "inspection:kensa_inspections!inner(inspection_date,time_slot,status,period_id,store:kensa_stores(name))",
      )
      .is("notified_at", null)
      .eq("inspection.period_id", id),
  ) as unknown as Row[];

  const byInspector = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.inspector || !r.inspection || r.inspection.status === "cancelled") continue;
    const list = byInspector.get(r.inspector.id) ?? [];
    list.push(r);
    byInspector.set(r.inspector.id, list);
  }

  const result = { sent: 0, skipped: [] as string[], errors: [] as string[] };
  for (const list of byInspector.values()) {
    const insp = list[0].inspector!;
    if (!insp.line_user_id) {
      result.skipped.push(insp.name);
      continue;
    }
    list.sort((a, b) => a.inspection!.inspection_date.localeCompare(b.inspection!.inspection_date));
    const lines = list.map(
      (r) => `・${fmtDate(r.inspection!.inspection_date)} ${r.inspection!.time_slot} ${r.inspection!.store?.name ?? ""}`.trim(),
    );
    try {
      await pushMessage(insp.line_user_id, [
        buttonMessage({
          altText: `${fmtMonth(period.year_month)}の検査担当が確定しました`,
          title: `✅ ${fmtMonth(period.year_month)} 担当確定のお知らせ`,
          lines,
          label: "スケジュールを確認",
          uri: liffUrl(`/liff/schedule?month=${period.year_month}`),
        }),
      ]);
      must(
        await db()
          .from("kensa_assignments")
          .update({ notified_at: new Date().toISOString() })
          .in("id", list.map((r) => r.id))
          .select("id"),
      );
      result.sent++;
    } catch (e) {
      result.errors.push(`${insp.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return result;
});
