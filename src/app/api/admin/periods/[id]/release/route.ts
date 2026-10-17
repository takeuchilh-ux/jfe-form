import { handle, body } from "@/lib/api";
import { requireAdmin, HttpError } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { buttonMessage, liffUrl, multicast } from "@/lib/line";
import { fmtDate, fmtMonth } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

/** 月間スケジュールを研修生へ公開し、同行を申し込めるようにする（notify: true なら研修生へ LINE でお知らせ） */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body<{ notify?: unknown }>(req).catch(() => ({ notify: false }));
  const period = must(await db().from("kensa_periods").select("*").eq("id", id).single());
  const { count } = await db()
    .from("kensa_inspections")
    .select("id", { count: "exact", head: true })
    .eq("period_id", id)
    .eq("status", "open");
  if (!count) throw new HttpError(400, "検査が 1 件も登録されていません");

  must(
    await db()
      .from("kensa_periods")
      .update({ status: "released", released_at: new Date().toISOString(), closed_at: null })
      .eq("id", id)
      .select("id"),
  );
  if (!b.notify) return { sent: 0, lineError: null };

  const trainees = must(
    await db()
      .from("kensa_inspectors")
      .select("line_user_id")
      .eq("active", true)
      .eq("kind", "trainee")
      .not("approved_at", "is", null)
      .not("line_user_id", "is", null),
  ) as { line_user_id: string }[];
  const to = trainees.map((i) => i.line_user_id);
  const lines = [`検査件数：${count} 件`];
  if (period.response_deadline) lines.push(`申込締切：${fmtDate(period.response_deadline)}`);
  lines.push("同行したい検査を選んで申し込んでください。");

  let sent = 0;
  let lineError: string | null = null;
  if (to.length) {
    try {
      await multicast(to, [
        buttonMessage({
          altText: `${fmtMonth(period.year_month)}の同行の申し込みを受け付けています`,
          title: `🙋 ${fmtMonth(period.year_month)}の同行申し込み`,
          lines,
          label: "同行する日を選ぶ",
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
