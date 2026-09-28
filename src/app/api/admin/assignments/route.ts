import { handle, body, isUuid, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

/** 検査の担当者を inspector_ids に置き換える（追加分は未通知として登録） */
export const PUT = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ inspection_id?: unknown; inspector_ids?: unknown[] }>(req);
  if (!isUuid(b.inspection_id)) bad("inspection_id が不正です");
  const ids = [...new Set((b.inspector_ids ?? []).filter(isUuid))];
  if (ids.length > 10) bad("担当者は 10 名までです");
  const current = must(
    await db().from("kensa_assignments").select("inspector_id").eq("inspection_id", b.inspection_id),
  ) as { inspector_id: string }[];
  const currentIds = current.map((c) => c.inspector_id);
  const toRemove = currentIds.filter((id) => !ids.includes(id));
  const toAdd = ids.filter((id) => !currentIds.includes(id));
  if (toRemove.length) {
    must(await db().from("kensa_assignments").delete().eq("inspection_id", b.inspection_id).in("inspector_id", toRemove).select("id"));
  }
  if (toAdd.length) {
    must(await db().from("kensa_assignments").insert(toAdd.map((inspector_id) => ({ inspection_id: b.inspection_id, inspector_id }))));
  }
  return { added: toAdd.length, removed: toRemove.length };
});
