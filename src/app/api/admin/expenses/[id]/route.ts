import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  if ("status" in b) {
    if (!["submitted", "approved", "rejected", "paid"].includes(String(b.status))) bad("状態が不正です");
    patch.status = b.status;
  }
  if ("admin_comment" in b) patch.admin_comment = str(b.admin_comment, 1000);
  return must(await db().from("kensa_expenses").update(patch).eq("id", id).select().single());
});
