import { handle } from "@/lib/api";
import { requireAdmin, HttpError } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { buttonMessage, liffUrl, multicast } from "@/lib/line";
import { fmtDate, fmtMonth } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

/** 月間スケジュールを検査員へリリースし、LINE で受注可否の回答を依頼する */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const period = must(await db().from("kensa_periods").select("*").eq("id", id).single());
  const { count } = await db()
    .from("kensa_inspections")
    .select("id", { count: "exact", head: true })
    .eq("period_id", id)
    .neq("status", "cancelled");
  if (!count) throw new HttpError(400, "検査が 1 件も登録されていません");

  must(
    await db()
      .from("kensa_periods")
      .update({ status: "released", released_at: new Date().toISOString(), closed_at: null })
      .eq("id", id)
      .select()
      .single(),
  );

  const inspectors = must(
    await db().from("kensa_inspectors").select("line_user_id").eq("active", true).not("approved_at", "is", null).not("line_user_id", "is", null),
  ) as { line_user_id: string }[];
  const to = inspectors.map((i) => i.line_user_id);

  const lines = [`検査件数：${count} 件`];
  if (period.response_deadline) lines.push(`回答期限：${fmtDate(period.response_deadline)}`);
  lines.push("対応可能な検査に「可」、難しい検査に「不可」を選んで回答してください。");

  let sent = 0;
  let lineError: string | null = null;
  if (to.length) {
    try {
      await multicast(to, [
        buttonMessage({
          altText: `${fmtMonth(period.year_month)}の検査スケジュールが公開されました`,
          title: `📋 ${fmtMonth(period.year_month)}の検査スケジュール`,
          lines,
          label: "受注可否を回答する",
          uri: liffUrl(`/liff/offers?month=${period.year_month}`),
        }),
      ]);
      sent = to.length;
    } catch (e) {
      lineError = e instanceof Error ? e.message : String(e);
    }
  }
  return { sent, lineError };
});
