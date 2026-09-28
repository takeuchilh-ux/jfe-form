import { handle, body, str, isDate, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { buttonMessage, liffUrl, pushMessage } from "@/lib/line";
import { fmtDate, todayJst } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

/** 本番テスト申請の承認／却下（受験日の変更も可）。結果を検査員へ LINE で通知する */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  if (b.action !== "approve" && b.action !== "reject") bad("操作が不正です");
  const current = must(await db().from("kensa_test_requests").select("status,exam_date").eq("id", id).single());
  if (!["pending", "approved"].includes(current.status)) bad("この申請は変更できません");

  const patch: Record<string, unknown> = {
    status: b.action === "approve" ? "approved" : "rejected",
    admin_comment: str(b.admin_comment, 500),
    decided_at: new Date().toISOString(),
  };
  if (b.action === "approve") {
    const date = b.exam_date ?? current.exam_date;
    if (!isDate(date)) bad("受験日が不正です");
    if (date < todayJst()) bad("受験日は今日以降にしてください");
    patch.exam_date = date;
  }
  const row = must(
    await db()
      .from("kensa_test_requests")
      .update(patch)
      .eq("id", id)
      .select("exam_date,status,admin_comment,inspector:kensa_inspectors(name,line_user_id)")
      .single(),
  ) as unknown as { exam_date: string; status: string; admin_comment: string; inspector: { name: string; line_user_id: string | null } | null };

  let lineError: string | null = null;
  if (row.inspector?.line_user_id) {
    const approved = row.status === "approved";
    try {
      await pushMessage(row.inspector.line_user_id, [
        buttonMessage({
          altText: approved ? "本番テストの受験が承認されました" : "本番テストの申請が却下されました",
          title: approved ? "✅ 本番テストの受験が承認されました" : "本番テストの申請について",
          lines: approved
            ? [`受験日：${fmtDate(row.exam_date)}`, "当日、メニューの「50問テスト」から本番テストを受験してください。", ...(row.admin_comment ? [row.admin_comment] : [])]
            : ["申請は承認されませんでした。", ...(row.admin_comment ? [`理由：${row.admin_comment}`] : []), "日程を変えて再度申請してください。"],
          label: "50問テストを開く",
          uri: liffUrl("/liff/test"),
        }),
      ]);
    } catch (e) {
      lineError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: true, lineError };
});

/** 申請を削除（受験済みなら本番の結果も削除される） */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  must(await db().from("kensa_test_attempts").delete().eq("request_id", id).select("id"));
  must(await db().from("kensa_test_requests").delete().eq("id", id).select("id"));
});
