import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { fullName, parseProfile } from "@/lib/profile";
import { buttonMessage, liffUrl, pushMessage } from "@/lib/line";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body(req);
  const patch: Record<string, unknown> = {};
  if ("last_name" in b) {
    const p = parseProfile(b);
    if (typeof p === "string") bad(p);
    Object.assign(patch, p, { name: fullName(p) });
  }
  if ("area" in b) patch.area = str(b.area, 100);
  if ("notes" in b) patch.notes = str(b.notes, 1000);
  if ("active" in b) patch.active = !!b.active;

  // 承認：承認日時を記録し、本人へ LINE で通知
  let approvedNow = false;
  if (b.approve) {
    const cur = must(await db().from("kensa_inspectors").select("approved_at").eq("id", id).single());
    if (!cur.approved_at) {
      patch.approved_at = new Date().toISOString();
      approvedNow = true;
    }
  }
  const row = must(await db().from("kensa_inspectors").update(patch).eq("id", id).select().single());

  let lineError: string | null = null;
  if (approvedNow && row.line_user_id) {
    try {
      await pushMessage(row.line_user_id, [
        buttonMessage({
          altText: "検査員登録が承認されました",
          title: "✅ 検査員登録が承認されました",
          lines: [`${row.name} さん、ご登録ありがとうございます。`, "スケジュールが公開されると、この LINE でお知らせします。"],
          label: "メニューを開く",
          uri: liffUrl("/liff"),
        }),
      ]);
    } catch (e) {
      lineError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ...row, lineError };
});
