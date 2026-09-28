import { handle, body, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { questionFields } from "@/lib/questions";

/** rows: [{ category, question, choices: string[], correct_index, explanation }] を一括登録 */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ rows?: Record<string, unknown>[] }>(req);
  const rows = b.rows ?? [];
  if (!rows.length) bad("取り込む行がありません");
  if (rows.length > 500) bad("一度に取り込めるのは 500 問までです");
  const { data: last } = await db().from("kensa_questions").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  let order = (last?.sort_order ?? 0) + 1;
  const inserts = rows.map((r, i) => {
    const q = questionFields(r);
    if (typeof q === "string") bad(`${i + 1} 行目：${q}`);
    return { ...q, sort_order: order++ };
  });
  must(await db().from("kensa_questions").insert(inserts).select("id"));
  return { count: inserts.length };
});
