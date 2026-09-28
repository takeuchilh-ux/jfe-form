import { handle, body, str, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must, RECEIPT_BUCKET } from "@/lib/supabase";
import { fullName, parseProfile } from "@/lib/profile";
import { buttonMessage, liffUrl, pushMessage } from "@/lib/line";
import { syncUserRichMenu } from "@/lib/richmenu";
import { KIND_LABEL } from "@/lib/format";

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
  if ("kind" in b) {
    if (b.kind !== "inspector" && b.kind !== "trainee") bad("区分が不正です");
    patch.kind = b.kind;
  }

  const cur = must(await db().from("kensa_inspectors").select("approved_at,kind,active").eq("id", id).single());
  // 承認：承認日時を記録し、本人へ LINE で通知
  let approvedNow = false;
  if (b.approve && !cur.approved_at) {
    patch.approved_at = new Date().toISOString();
    approvedNow = true;
  }
  const row = must(await db().from("kensa_inspectors").update(patch).eq("id", id).select().single());

  const errors: string[] = [];
  // 承認・区分変更・有効/無効の切り替え時は、リッチメニューを区分に合わせて切り替える
  if (approvedNow || row.kind !== cur.kind || row.active !== cur.active) {
    const e = await syncUserRichMenu(row);
    if (e) errors.push(`メニュー切替：${e}`);
  }
  if (approvedNow && row.line_user_id) {
    try {
      await pushMessage(row.line_user_id, [
        buttonMessage({
          altText: "登録が承認されました",
          title: `✅ ${KIND_LABEL[row.kind as keyof typeof KIND_LABEL]}として登録が承認されました`,
          lines: [`${row.name} さん、ご登録ありがとうございます。`, "下のメニューからご利用ください。スケジュールが公開されると、この LINE でお知らせします。"],
          label: "メニューを開く",
          uri: liffUrl("/liff"),
        }),
      ]);
    } catch (e) {
      errors.push(`通知：${e instanceof Error ? e.message : e}`);
    }
  }
  return { ...row, lineError: errors.length ? errors.join(" / ") : null };
});

/** 検査員を完全に削除（回答・アサイン・交通費・レシート画像・テストの申請と結果も削除） */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const row = must(await db().from("kensa_inspectors").select("line_user_id,kind").eq("id", id).single());
  const expenses = must(await db().from("kensa_expenses").select("receipt_paths").eq("inspector_id", id)) as { receipt_paths: string[] }[];
  const paths = expenses.flatMap((e) => e.receipt_paths ?? []);
  // テスト結果は申請の削除で紐づけが外れるため先に削除
  must(await db().from("kensa_test_attempts").delete().eq("inspector_id", id).select("id"));
  must(await db().from("kensa_inspectors").delete().eq("id", id).select("id"));
  if (paths.length) await db().storage.from(RECEIPT_BUCKET).remove(paths);
  // LINE のメニューを未登録者用に戻す（再登録できるように）
  await syncUserRichMenu({ line_user_id: row.line_user_id, kind: row.kind, active: false, approved_at: null });
});
