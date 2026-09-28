import crypto from "node:crypto";
import { handle, isDate, isMonth, isUuid, str, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must, RECEIPT_BUCKET } from "@/lib/supabase";
import { trainTotal, type TrainLeg } from "@/lib/expense";
import { monthRange, thisMonthJst, todayJst } from "@/lib/format";

const MAX_FILES = 10;
// Vercel のリクエスト上限（4.5MB）に収まるよう、画像はブラウザ側で縮小してから送信する
const MAX_SIZE = 4 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const EXPENSE_SELECT =
  "id,use_date,transport,distance_km,route_stops,parking_fee,train_legs,amount,note,status,admin_comment,receipt_paths,created_at," +
  "links:kensa_expense_inspections(inspection_id,inspection:kensa_inspections(time_slot,store:kensa_stores(name)))";

type ExpenseDb = { receipt_paths: string[]; links: { inspection_id: string }[] } & Record<string, unknown>;
const view = ({ receipt_paths, ...e }: ExpenseDb) => ({ ...e, receipt_count: receipt_paths.length });

/**
 * 交通費画面のデータ：
 * - cases：直近 60 日〜今日の担当案件（日付ごと）と、案件に紐づく申請
 * - history：指定月の申請履歴
 */
export const GET = handle(async (req: Request) => {
  const me = await currentInspector();
  const q = new URL(req.url).searchParams.get("month");
  const month = isMonth(q) ? q : thisMonthJst();
  const { start, end } = monthRange(month);
  const from = new Date(Date.now() + 9 * 3600000 - 60 * 86400000).toISOString().slice(0, 10);

  const [history, recent, assigned] = await Promise.all([
    db().from("kensa_expenses").select(EXPENSE_SELECT).eq("inspector_id", me.id).gte("use_date", start).lt("use_date", end).order("use_date", { ascending: false }).order("created_at", { ascending: false }),
    db().from("kensa_expenses").select(EXPENSE_SELECT).eq("inspector_id", me.id).gte("use_date", from).order("created_at"),
    db()
      .from("kensa_assignments")
      .select("role,inspection:kensa_inspections!inner(id,inspection_date,time_slot,status,store:kensa_stores(name,address))")
      .eq("inspector_id", me.id)
      .gte("inspection.inspection_date", from)
      .lte("inspection.inspection_date", todayJst())
      .neq("inspection.status", "cancelled"),
  ]);
  const recentRows = (must(recent) as unknown as ExpenseDb[]).map(view);
  const cases = (must(assigned) as unknown as {
    role: string;
    inspection: { id: string; inspection_date: string; time_slot: string; store: { name: string; address: string } | null };
  }[])
    .map(({ role, inspection: i }) => ({
      id: i.id,
      date: i.inspection_date,
      time: i.time_slot,
      store: i.store?.name ?? "",
      address: i.store?.address ?? "",
      role,
      expenses: recentRows.filter((e) => (e.links as { inspection_id: string }[]).some((l) => l.inspection_id === i.id)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));

  return {
    month,
    cases,
    // 案件に紐づかない直近の申請
    others: recentRows.filter((e) => !(e.links as unknown[]).length),
    history: (must(history) as unknown as ExpenseDb[]).map(view),
  };
});

/** 交通費申請（multipart/form-data。レシート画像は任意で最大 10 枚） */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector();
  const form = await req.formData().catch(() => bad("リクエストの形式が不正です"));
  const useDate = form.get("use_date");
  const transport = form.get("transport");
  const inspectionIds = [...new Set(form.getAll("inspection_ids").map(String))];
  const note = str(form.get("note"), 500);
  if (!isDate(useDate)) bad("利用日を入力してください");
  if (useDate > todayJst()) bad("未来の日付は申請できません");
  if (transport !== "car" && transport !== "train") bad("交通手段を選択してください");

  // 1 日に複数店舗を回る場合に備え、対象の検査は複数指定可
  if (inspectionIds.length > 20) bad("対象の検査が多すぎます");
  if (inspectionIds.some((id) => !isUuid(id))) bad("検査の指定が不正です");
  if (inspectionIds.length) {
    const { count } = await db()
      .from("kensa_assignments")
      .select("id", { count: "exact", head: true })
      .in("inspection_id", inspectionIds)
      .eq("inspector_id", me.id);
    if (count !== inspectionIds.length) bad("担当していない検査は選択できません");
  }

  const row: Record<string, unknown> = { inspector_id: me.id, use_date: useDate, transport, note };
  const files = form.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);

  if (transport === "car") {
    const distance = Number(form.get("distance_km"));
    const parking = Math.round(Number(form.get("parking_fee") || 0));
    if (!Number.isFinite(distance) || distance <= 0 || distance > 2000) bad("走行距離（km）を正しく入力してください");
    if (!Number.isFinite(parking) || parking < 0 || parking > 100000) bad("駐車場代を正しく入力してください");
    // 車は距離（km）を記録。金額は駐車場代のみ（距離の精算方法は管理側で決定）
    Object.assign(row, {
      distance_km: Math.round(distance * 10) / 10,
      route_stops: parseStops(form.get("route_stops")),
      parking_fee: parking,
      amount: parking,
    });
  } else {
    let legs: TrainLeg[];
    try {
      const raw = JSON.parse(String(form.get("train_legs") ?? "[]")) as Record<string, unknown>[];
      legs = raw.map((l) => ({ from: str(l.from, 50), to: str(l.to, 50), fare: Math.round(Number(l.fare)), round_trip: !!l.round_trip }));
    } catch {
      bad("電車の区間が不正です");
    }
    if (!legs.length || legs.length > 10) bad("電車の区間を 1〜10 件入力してください");
    if (legs.some((l) => !l.from || !l.to || !Number.isFinite(l.fare) || l.fare <= 0 || l.fare > 50000)) {
      bad("区間の駅名と運賃を正しく入力してください");
    }
    Object.assign(row, { train_legs: legs, amount: trainTotal(legs) });
  }

  if (files.length > MAX_FILES) bad(`添付は ${MAX_FILES} 枚までです`);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_SIZE) bad("添付ファイルの合計サイズが大きすぎます。枚数を減らして申請してください");
  const paths: string[] = [];
  for (const f of files) {
    const ext = EXT[f.type];
    if (!ext) bad("添付できるのは画像（JPEG/PNG/HEIC/WebP）または PDF です");
    if (f.size > MAX_SIZE) bad("添付ファイルが大きすぎます");
  }
  try {
    for (const f of files) {
      const path = `${me.id}/${useDate.slice(0, 7)}/${crypto.randomUUID()}.${EXT[f.type]}`;
      must(await db().storage.from(RECEIPT_BUCKET).upload(path, f, { contentType: f.type }));
      paths.push(path);
    }
    row.receipt_paths = paths;
    const created = must(await db().from("kensa_expenses").insert(row).select("id,amount").single());
    if (inspectionIds.length) {
      const link = await db()
        .from("kensa_expense_inspections")
        .insert(inspectionIds.map((inspection_id) => ({ expense_id: created.id, inspection_id })));
      if (link.error) {
        await db().from("kensa_expenses").delete().eq("id", created.id);
        throw new Error(link.error.message);
      }
    }
    return created;
  } catch (e) {
    if (paths.length) await db().storage.from(RECEIPT_BUCKET).remove(paths);
    throw e;
  }
});

/** 車の経路（出発地 → 経由地 → 到着地）の JSON 配列を検証 */
function parseStops(v: FormDataEntryValue | null): string[] {
  try {
    const arr = JSON.parse(String(v ?? "[]"));
    if (!Array.isArray(arr)) return [];
    return arr.map((s) => str(s, 300)).filter(Boolean).slice(0, 10);
  } catch {
    return [];
  }
}
