import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { questionFields } from "@/lib/questions";
import defaults from "@/data/default-questions.json";

/** 衛生巡回サービス手順書から作成した初期問題を登録（同じ問題文が既にあるものは除く） */
export const POST = handle(async () => {
  await requireAdmin();
  const existing = must(await db().from("kensa_questions").select("question,sort_order")) as { question: string; sort_order: number }[];
  const have = new Set(existing.map((q) => q.question));
  let order = existing.reduce((m, q) => Math.max(m, q.sort_order), 0) + 1;
  const rows = defaults
    .filter((d) => !have.has(d.question))
    .map((d) => {
      const q = questionFields(d as Record<string, unknown>);
      if (typeof q === "string") throw new Error(`初期問題が不正です: ${d.question}`);
      return { ...q, sort_order: order++ };
    });
  if (rows.length) must(await db().from("kensa_questions").insert(rows).select("id"));
  return { count: rows.length };
});
