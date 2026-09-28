import { handle, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must, RECEIPT_BUCKET } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/** 申請中・差戻しの申請のみ取り下げ可能 */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const me = await currentInspector();
  const { id } = await params;
  const { data } = await db().from("kensa_expenses").select("status,receipt_paths").eq("id", id).eq("inspector_id", me.id).maybeSingle();
  if (!data) bad("申請が見つかりません");
  if (!["submitted", "rejected"].includes(data.status)) bad("承認済みの申請は取り下げできません");
  must(await db().from("kensa_expenses").delete().eq("id", id).eq("inspector_id", me.id).select("id"));
  const paths = (data.receipt_paths ?? []) as string[];
  if (paths.length) await db().storage.from(RECEIPT_BUCKET).remove(paths);
});
