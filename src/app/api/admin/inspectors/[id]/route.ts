import crypto from "node:crypto";
import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "name_kana", "phone", "email", "area", "notes"] as const) {
    if (k in b) patch[k] = str(b[k], k === "notes" ? 1000 : 200);
  }
  if ("active" in b) patch.active = !!b.active;
  if (patch.name === "") bad("氏名を入力してください");
  // LINE 連携を解除（機種変更など）
  if (b.unlink) Object.assign(patch, { line_user_id: null, line_display_name: "", linked_at: null });
  // 連携コードを再発行
  if (b.unlink || b.regenerate_code) patch.link_code = crypto.randomBytes(3).toString("hex").toUpperCase();
  return must(await db().from("kensa_inspectors").update(patch).eq("id", id).select().single());
});
