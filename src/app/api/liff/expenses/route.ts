import crypto from "node:crypto";
import { handle, isDate, isMonth, isUuid, str, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must, RECEIPT_BUCKET } from "@/lib/supabase";
import { trainTotal, type TrainLeg } from "@/lib/expense";
import { monthRange, thisMonthJst, todayJst } from "@/lib/format";

const MAX_FILES = 5;
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

/** 自分の交通費申請（月別）と、申請に紐づけられる担当検査 */
export const GET = handle(async (req: Request) => {
  const me = await currentInspector();
  const q = new URL(req.url).searchParams.get("month");
  const month = isMonth(q) ? q : thisMonthJst();
  const { start, end } = monthRange(month);
  const expenses = must(
    await db()
      .from("kensa_expenses")
      .select("id,use_date,transport,distance_km,route_from,route_to,round_trip,parking_fee,train_legs,amount,note,status,admin_comment,receipt_paths,inspection:kensa_inspections(store:kensa_stores(name))")
      .eq("inspector_id", me.id)
      .gte("use_date", start)
      .lt("use_date", end)
      .order("use_date", { ascending: false }),
  ) as unknown as ({ receipt_paths: string[] } & Record<string, unknown>)[];

  // 直近 60 日＋今日以前の担当検査
  const from = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const assigned = must(
    await db()
      .from("kensa_assignments")
      .select("inspection:kensa_inspections!inner(id,inspection_date,time_slot,status,store:kensa_stores(name,address))")
      .eq("inspector_id", me.id)
      .gte("inspection.inspection_date", from)
      .lte("inspection.inspection_date", todayJst())
      .neq("inspection.status", "cancelled"),
  ) as unknown as { inspection: { id: string; inspection_date: string; time_slot: string; store: { name: string; address: string } | null } }[];

  return {
    month,
    expenses: expenses.map(({ receipt_paths, ...e }) => ({ ...e, receipt_count: receipt_paths.length })),
    inspections: assigned
      .map(({ inspection: i }) => ({
        id: i.id,
        date: i.inspection_date,
        time: i.time_slot,
        store: i.store?.name ?? "",
        address: i.store?.address ?? "",
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
});

/** 交通費申請（multipart/form-data。車の駐車場代にはレシート画像が必須） */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector();
  const form = await req.formData().catch(() => bad("リクエストの形式が不正です"));
  const useDate = form.get("use_date");
  const transport = form.get("transport");
  const inspectionId = form.get("inspection_id");
  const note = str(form.get("note"), 500);
  if (!isDate(useDate)) bad("利用日を入力してください");
  if (useDate > todayJst()) bad("未来の日付は申請できません");
  if (transport !== "car" && transport !== "train") bad("交通手段を選択してください");

  let inspection_id: string | null = null;
  if (inspectionId) {
    if (!isUuid(inspectionId)) bad("検査の指定が不正です");
    const { count } = await db()
      .from("kensa_assignments")
      .select("id", { count: "exact", head: true })
      .eq("inspection_id", inspectionId)
      .eq("inspector_id", me.id);
    if (!count) bad("担当していない検査は選択できません");
    inspection_id = inspectionId;
  }

  const row: Record<string, unknown> = { inspector_id: me.id, inspection_id, use_date: useDate, transport, note };
  const files = form.getAll("receipts").filter((f): f is File => f instanceof File && f.size > 0);

  if (transport === "car") {
    const distance = Number(form.get("distance_km"));
    const parking = Math.round(Number(form.get("parking_fee") || 0));
    if (!Number.isFinite(distance) || distance <= 0 || distance > 2000) bad("走行距離（km）を正しく入力してください");
    if (!Number.isFinite(parking) || parking < 0 || parking > 100000) bad("駐車場代を正しく入力してください");
    if (parking > 0 && !files.length) bad("駐車場代がある場合はレシート画像を添付してください");
    // 車は距離（km）を記録。金額は駐車場代のみ（距離の精算方法は管理側で決定）
    Object.assign(row, {
      distance_km: Math.round(distance * 10) / 10,
      route_from: str(form.get("route_from"), 300),
      route_to: str(form.get("route_to"), 300),
      round_trip: form.get("round_trip") === "1",
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
  const paths: string[] = [];
  for (const f of files) {
    const ext = EXT[f.type];
    if (!ext) bad("添付できるのは画像（JPEG/PNG/HEIC/WebP）または PDF です");
    if (f.size > MAX_SIZE) bad("添付ファイルが大きすぎます（1 枚 4MB まで）");
  }
  try {
    for (const f of files) {
      const path = `${me.id}/${useDate.slice(0, 7)}/${crypto.randomUUID()}.${EXT[f.type]}`;
      must(await db().storage.from(RECEIPT_BUCKET).upload(path, f, { contentType: f.type }));
      paths.push(path);
    }
    row.receipt_paths = paths;
    return must(await db().from("kensa_expenses").insert(row).select("id,amount").single());
  } catch (e) {
    if (paths.length) await db().storage.from(RECEIPT_BUCKET).remove(paths);
    throw e;
  }
});
