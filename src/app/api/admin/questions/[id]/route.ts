import { handle, body, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { questionFields } from "@/lib/questions";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  if ("question" in b) {
    const q = questionFields(b);
    if (typeof q === "string") bad(q);
    Object.assign(patch, q);
  }
  if ("active" in b) patch.active = !!b.active;
  return must(await db().from("kensa_questions").update(patch).eq("id", id).select().single());
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  must(await db().from("kensa_questions").delete().eq("id", id).select("id"));
});
