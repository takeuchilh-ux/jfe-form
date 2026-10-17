import "server-only";
import { db, must } from "./supabase";
import { buttonMessage, liffUrl, pushMessage } from "./line";
import { fmtDate, todayJst } from "./format";

/** 店舗名・人名の比較用（空白を除き、﨑→崎） */
export function normName(s: string) {
  return s.replace(/[\s　]/g, "").replace(/﨑/g, "崎");
}

/** 指定月のスケジュール枠の ID（なければ作成） */
export async function periodIdFor(month: string): Promise<string> {
  const row = must(await db().from("kensa_periods").upsert({ year_month: month }, { onConflict: "year_month" }).select("id").single());
  return row.id as string;
}

/** 研修生が同行を申し込める期間か（公開中で、締切を過ぎていない） */
export function isTraineeOpen(p: { status: string; response_deadline: string | null }) {
  return p.status === "released" && (!p.response_deadline || p.response_deadline >= todayJst());
}

/** 日本時間の明日 "YYYY-MM-DD" */
export function tomorrowJst() {
  return new Date(Date.now() + 33 * 3600 * 1000).toISOString().slice(0, 10);
}

type ReminderRow = {
  id: string;
  role: string;
  inspector: { id: string; name: string; active: boolean; line_user_id: string | null } | null;
  inspection: {
    id: string;
    inspection_date: string;
    time_slot: string;
    store: { name: string; address: string } | null;
    assignments: { role: string; inspector: { id: string; name: string } | null }[];
  };
};

/**
 * date（既定は明日）の検査について、担当の検査員・同行の研修生へ LINE でリマインドを送る。
 * 送信済み（reminded_at あり）は送らない。日時が変更されると reminded_at は消える
 */
export async function sendReminders(date = tomorrowJst()) {
  const rows = must(
    await db()
      .from("kensa_assignments")
      .select(
        "id,role,inspector:kensa_inspectors(id,name,active,line_user_id)," +
          "inspection:kensa_inspections!inner(id,inspection_date,time_slot,status,store:kensa_stores(name,address)," +
          "assignments:kensa_assignments(role,inspector:kensa_inspectors(id,name)))",
      )
      .is("reminded_at", null)
      .eq("inspection.inspection_date", date)
      .eq("inspection.status", "open"),
  ) as unknown as ReminderRow[];

  const byPerson = new Map<string, ReminderRow[]>();
  const skipped: string[] = [];
  for (const r of rows) {
    if (!r.inspector?.active) continue;
    if (!r.inspector.line_user_id) {
      if (!skipped.includes(r.inspector.name)) skipped.push(r.inspector.name);
      continue;
    }
    byPerson.set(r.inspector.id, [...(byPerson.get(r.inspector.id) ?? []), r]);
  }

  let sent = 0;
  const errors: string[] = [];
  for (const list of byPerson.values()) {
    const me = list[0].inspector!;
    list.sort((a, b) => a.inspection.time_slot.localeCompare(b.inspection.time_slot, "ja", { numeric: true }));
    const lines = list.flatMap(({ inspection: i, role }) => {
      const others = i.assignments
        .filter((a) => a.inspector && a.inspector.id !== me.id)
        .map((a) => `${a.inspector!.name}${a.role === "trainee" ? "（同行）" : ""}`);
      return [
        `■ ${i.time_slot || "時間未定"}　${i.store?.name ?? ""}${role === "trainee" ? "（同行）" : ""}`,
        ...(i.store?.address ? [`　${i.store.address}`] : []),
        ...(others.length ? [`　${role === "trainee" ? "担当" : "同行"}：${others.join("、")}`] : []),
      ];
    });
    try {
      await pushMessage(me.line_user_id!, [
        buttonMessage({
          altText: `明日（${fmtDate(date)}）の検査のお知らせ`,
          title: `📅 明日 ${fmtDate(date)} の検査`,
          lines: [...lines, "よろしくお願いします。"],
          label: "マイスケジュールを開く",
          uri: liffUrl(`/liff/schedule?month=${date.slice(0, 7)}`),
        }),
      ]);
      must(
        await db()
          .from("kensa_assignments")
          .update({ reminded_at: new Date().toISOString() })
          .in(
            "id",
            list.map((r) => r.id),
          )
          .select("id"),
      );
      sent++;
    } catch (e) {
      errors.push(`${me.name}：${e instanceof Error ? e.message : e}`);
    }
  }
  return { date, sent, skipped, errors };
}
