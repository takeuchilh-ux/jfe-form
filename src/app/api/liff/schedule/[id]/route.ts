import { handle, body, str, isDate, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { HttpError } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { fmtDate, todayJst } from "@/lib/format";
import { periodIdFor } from "@/lib/schedule";

type Ctx = { params: Promise<{ id: string }> };

/** 担当の検査員が、自分の検査の日付・時間を変更する（管理画面に「変更あり」として表示される） */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const me = await currentInspector({ only: "inspector" });
  const { id } = await params;
  const b = await body<{ date?: unknown; time?: unknown }>(req);
  if (!isDate(b.date)) bad("日付を入力してください");
  const time = str(b.time, 50);
  const today = todayJst();
  if (b.date < today) bad("過去の日付には変更できません");

  const ins = must(
    await db()
      .from("kensa_inspections")
      .select("id,inspection_date,time_slot,status,change_note,assignments:kensa_assignments(inspector_id,role)")
      .eq("id", id)
      .single(),
  ) as unknown as { id: string; inspection_date: string; time_slot: string; status: string; change_note: string; assignments: { inspector_id: string; role: string }[] };
  if (!ins.assignments.some((a) => a.inspector_id === me.id && a.role !== "trainee")) throw new HttpError(403, "担当の検査ではありません");
  if (ins.status !== "open") bad("この検査は変更できません");
  if (ins.inspection_date < today) bad("終わった検査は変更できません");
  if (ins.inspection_date === b.date && ins.time_slot === time) return { ok: true };

  const line = `${fmtDate(ins.inspection_date)} ${ins.time_slot} → ${fmtDate(b.date)} ${time}（${me.name}が変更）`;
  must(
    await db()
      .from("kensa_inspections")
      .update({
        inspection_date: b.date,
        time_slot: time,
        period_id: await periodIdFor(b.date.slice(0, 7)),
        change_note: [ins.change_note, line].filter(Boolean).join("\n").slice(-1000),
        changed_at: new Date().toISOString(),
        change_seen: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id"),
  );
  // 新しい日付の前日に改めてリマインドする
  must(await db().from("kensa_assignments").update({ reminded_at: null }).eq("inspection_id", id).select("id"));
  return { ok: true };
});
