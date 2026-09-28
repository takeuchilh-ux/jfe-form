import { handle, body, isDate, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must } from "@/lib/supabase";
import { openRequest } from "@/lib/testing";
import { todayJst } from "@/lib/format";

/** 本番テストの受験申請（受験日を指定） */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector();
  const { exam_date } = await body(req);
  if (!isDate(exam_date)) bad("受験日を選択してください");
  if (exam_date < todayJst()) bad("受験日は今日以降の日付を選択してください");
  if (await openRequest(me.id)) bad("申請中または承認済みの本番テストがあります");
  return must(await db().from("kensa_test_requests").insert({ inspector_id: me.id, exam_date }).select("id,exam_date,status").single());
});

/** 申請の取り下げ（未受験のもののみ） */
export const DELETE = handle(async () => {
  const me = await currentInspector();
  const r = await openRequest(me.id);
  if (!r) bad("取り下げられる申請がありません");
  const { count } = await db().from("kensa_test_attempts").select("id", { count: "exact", head: true }).eq("request_id", r.id);
  if (count) bad("受験を開始しているため取り下げできません");
  must(await db().from("kensa_test_requests").update({ status: "cancelled" }).eq("id", r.id).select("id"));
});
