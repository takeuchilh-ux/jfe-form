import { handle, body, isDate, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

/** 回答期限の変更、回答締切（closed）／再開（released） */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  if ("response_deadline" in b) {
    if (b.response_deadline !== null && b.response_deadline !== "" && !isDate(b.response_deadline)) bad("回答期限の形式が不正です");
    patch.response_deadline = b.response_deadline || null;
  }
  if (b.status === "closed") Object.assign(patch, { status: "closed", closed_at: new Date().toISOString() });
  if (b.status === "released") Object.assign(patch, { status: "released", closed_at: null });
  return must(await db().from("kensa_periods").update(patch).eq("id", id).select().single());
});
