import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/** 本番テストの結果を削除（紐づく申請も削除し、再申請できる状態に戻す） */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const row = must(await db().from("kensa_test_attempts").select("request_id").eq("id", id).single());
  must(await db().from("kensa_test_attempts").delete().eq("id", id).select("id"));
  if (row.request_id) must(await db().from("kensa_test_requests").delete().eq("id", row.request_id).select("id"));
});
