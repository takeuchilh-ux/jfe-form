import { handle, body, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { questionFields } from "@/lib/questions";

export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const q = questionFields(await body(req));
  if (typeof q === "string") bad(q);
  return must(await db().from("kensa_questions").insert(q).select().single());
});
