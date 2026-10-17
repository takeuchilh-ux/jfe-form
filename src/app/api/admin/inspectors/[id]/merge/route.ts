import { handle, body, isUuid, bad } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { PROFILE_KEYS } from "@/lib/profile";
import { buttonMessage, liffUrl, pushMessage } from "@/lib/line";
import { syncUserRichMenu } from "@/lib/richmenu";
import { KIND_LABEL } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

/** 本人の情報と紐づくデータを移すテーブル */
const CHILD_TABLES = ["kensa_availabilities", "kensa_assignments", "kensa_expenses", "kensa_test_requests", "kensa_test_attempts", "kensa_orders"];

/**
 * LINE から登録した検査員（[id]）を、管理者が先に登録していた LINE 未連携の検査員（into）に統合する。
 * 基本情報と LINE 連携は [id] のものを使い、区分・アサインなどは into のものを残す。統合後に [id] は削除し、承認済みとして通知する
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const b = await body<{ into?: unknown }>(req);
  if (!isUuid(b.into) || b.into === id) bad("統合先が不正です");
  const src = must(await db().from("kensa_inspectors").select("*").eq("id", id).single());
  const dst = must(await db().from("kensa_inspectors").select("*").eq("id", b.into).single());
  if (!src.line_user_id) bad("LINE から登録された検査員ではありません");
  if (dst.line_user_id) bad("統合先は既に LINE と連携済みです");

  for (const t of CHILD_TABLES) {
    must(await db().from(t).update({ inspector_id: dst.id }).eq("inspector_id", src.id).select("id"));
  }
  // LINE ID は一意なので、元の行を消してから統合先に付け替える
  must(await db().from("kensa_inspectors").delete().eq("id", src.id).select("id"));
  const patch: Record<string, unknown> = {
    name: src.name,
    line_user_id: src.line_user_id,
    line_display_name: src.line_display_name,
    linked_at: src.linked_at ?? new Date().toISOString(),
    active: true,
    approved_at: dst.approved_at ?? new Date().toISOString(),
  };
  for (const k of PROFILE_KEYS) patch[k] = src[k];
  const row = must(await db().from("kensa_inspectors").update(patch).eq("id", dst.id).select().single());

  const errors: string[] = [];
  const e = await syncUserRichMenu(row, new URL(req.url).origin);
  if (e) errors.push(`メニュー切替：${e}`);
  try {
    await pushMessage(row.line_user_id, [
      buttonMessage({
        altText: "登録が承認されました",
        title: `✅ ${KIND_LABEL[row.kind as keyof typeof KIND_LABEL]}として登録が承認されました`,
        lines: [`${row.name} さん、ご登録ありがとうございます。`, "下のメニューからご利用ください。担当の検査はマイスケジュールで確認できます。"],
        label: "メニューを開く",
        uri: liffUrl("/liff"),
      }),
    ]);
  } catch (err) {
    errors.push(`通知：${err instanceof Error ? err.message : err}`);
  }
  return { ...row, lineError: errors.length ? errors.join(" / ") : null };
});
