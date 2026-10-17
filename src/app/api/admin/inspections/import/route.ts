import { handle, body, str, int, isDate, isUuid, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { normName } from "@/lib/schedule";

type Input = {
  date?: unknown;
  time?: unknown;
  store?: unknown;
  address?: unknown;
  group?: unknown;
  main?: unknown;
  trainee?: unknown;
  notes?: unknown;
  trainee_slots?: unknown;
};

const splitNames = (v: unknown) =>
  str(v, 200)
    .split(/[、,，・/／]+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * JFE の予定表（店舗・訪問日・時間・担当・研修生・住所）を取り込む。
 * 未登録の店舗は作成し、担当・研修生は名前（フルネームまたは名字）で検査員に自動アサインする。
 * 同じ店舗・同じ日の検査が既にあれば、時間を更新して足りないアサインだけ追加する
 */
export const POST = handle(async (req: Request) => {
  await requireAdmin();
  const b = await body<{ period_id?: unknown; rows?: Input[] }>(req);
  if (!isUuid(b.period_id)) bad("period_id が不正です");
  const period = must(await db().from("kensa_periods").select("year_month").eq("id", b.period_id).single());
  const rows = (b.rows ?? []).map((r, i) => {
    const date = r.date;
    if (!isDate(date)) bad(`${i + 1} 行目：日付が不正です`);
    if (!date.startsWith(period.year_month)) bad(`${i + 1} 行目：${period.year_month} の日付を指定してください`);
    const store = str(r.store, 200);
    if (!store) bad(`${i + 1} 行目：店舗名がありません`);
    return {
      date,
      time: str(r.time, 50),
      store,
      address: str(r.address, 300),
      group: str(r.group, 200),
      main: splitNames(r.main),
      trainee: splitNames(r.trainee),
      notes: str(r.notes, 1000),
      slots: r.trainee_slots === "" || r.trainee_slots == null ? 1 : Math.min(5, Math.max(0, int(r.trainee_slots, 1))),
    };
  });
  if (!rows.length) bad("取り込む行がありません");
  if (rows.length > 500) bad("一度に取り込めるのは 500 行までです");

  // 店舗：名前の表記ゆれ（空白・﨑）を無視して照合し、なければ作成
  const stores = must(await db().from("kensa_stores").select("id,name")) as { id: string; name: string }[];
  const storeId = new Map(stores.map((s) => [normName(s.name), s.id]));
  const newStores = new Map<string, { name: string; address: string; group_name: string }>();
  for (const r of rows) {
    const k = normName(r.store);
    if (!storeId.has(k) && !newStores.has(k)) newStores.set(k, { name: r.store, address: r.address, group_name: r.group });
  }
  if (newStores.size) {
    const created = must(await db().from("kensa_stores").insert([...newStores.values()]).select("id,name")) as { id: string; name: string }[];
    for (const s of created) storeId.set(normName(s.name), s.id);
  }

  // 検査員：フルネーム → 名字の順で照合（同じ名字が複数いれば照合しない）
  const people = must(await db().from("kensa_inspectors").select("id,name,last_name").eq("active", true)) as { id: string; name: string; last_name: string }[];
  const findPerson = (n: string) => {
    const k = normName(n);
    const full = people.filter((p) => normName(p.name) === k);
    if (full.length === 1) return full[0].id;
    const last = people.filter((p) => normName(p.last_name || p.name) === k);
    return last.length === 1 ? last[0].id : null;
  };

  const existing = must(
    await db().from("kensa_inspections").select("id,store_id,inspection_date,assignments:kensa_assignments(inspector_id)").eq("period_id", b.period_id),
  ) as unknown as { id: string; store_id: string; inspection_date: string; assignments: { inspector_id: string }[] }[];
  const existingByKey = new Map(existing.map((e) => [`${e.store_id}|${e.inspection_date}`, e]));

  const unknownNames = new Set<string>();
  let added = 0;
  let updated = 0;
  let assigned = 0;
  for (const r of rows) {
    const sid = storeId.get(normName(r.store))!;
    const cur = existingByKey.get(`${sid}|${r.date}`);
    let inspectionId: string;
    let already: string[] = [];
    if (cur) {
      must(
        await db()
          .from("kensa_inspections")
          .update({ time_slot: r.time, trainee_slots: r.slots, ...(r.notes ? { notes: r.notes } : {}), updated_at: new Date().toISOString() })
          .eq("id", cur.id)
          .select("id"),
      );
      inspectionId = cur.id;
      already = cur.assignments.map((a) => a.inspector_id);
      updated++;
    } else {
      const row = must(
        await db()
          .from("kensa_inspections")
          .insert({ period_id: b.period_id, store_id: sid, inspection_date: r.date, time_slot: r.time, notes: r.notes, trainee_slots: r.slots })
          .select("id")
          .single(),
      );
      inspectionId = row.id;
      existingByKey.set(`${sid}|${r.date}`, { id: row.id, store_id: sid, inspection_date: r.date, assignments: [] });
      added++;
    }
    const toAdd: { inspection_id: string; inspector_id: string; role: string }[] = [];
    for (const [names, role] of [
      [r.main, "main"],
      [r.trainee, "trainee"],
    ] as const) {
      for (const n of names) {
        const pid = findPerson(n);
        if (!pid) unknownNames.add(n);
        else if (!already.includes(pid) && !toAdd.some((a) => a.inspector_id === pid)) toAdd.push({ inspection_id: inspectionId, inspector_id: pid, role });
      }
    }
    if (toAdd.length) {
      must(await db().from("kensa_assignments").insert(toAdd).select("id"));
      assigned += toAdd.length;
      existingByKey.get(`${sid}|${r.date}`)!.assignments.push(...toAdd.map((a) => ({ inspector_id: a.inspector_id })));
    }
  }
  return { added, updated, assigned, newStores: [...newStores.values()].map((s) => s.name), unknownNames: [...unknownNames] };
});
