import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";

/** rows: [{ name, group_name, area, address }] を一括登録 */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ rows?: Record<string, unknown>[] }>(req);
  const rows = (b.rows ?? [])
    .map((r) => ({ name: str(r.name, 200), group_name: str(r.group_name, 200), area: str(r.area, 100), address: str(r.address, 300) }))
    .filter((r) => r.name);
  if (!rows.length) bad("取り込む行がありません");
  if (rows.length > 1000) bad("一度に取り込めるのは 1000 行までです");
  must(await db().from("kensa_stores").insert(rows));
  return { count: rows.length };
});
