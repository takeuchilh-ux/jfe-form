import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "group_name", "area", "address", "notes"] as const) {
    if (k in b) patch[k] = str(b[k], k === "notes" ? 1000 : 300);
  }
  if ("active" in b) patch.active = !!b.active;
  if (patch.name === "") bad("店舗名を入力してください");
  return must(await db().from("kensa_stores").update(patch).eq("id", id).select().single());
});
