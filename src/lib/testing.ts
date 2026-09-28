import "server-only";
import crypto from "node:crypto";
import { db, maybe, must } from "./supabase";
import { todayJst } from "./format";

export type TestRequest = {
  id: string;
  exam_date: string;
  status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
  admin_comment: string;
  created_at: string;
};

type Q = { id: string; category: string; group_key: string; question: string; correct_index: number; explanation: string };

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 有効な問題から、同じテーマは 1 問だけ・テーマと順番をランダムに count 問選ぶ */
export async function pickQuestions(count: number): Promise<Q[]> {
  const all = must(
    await db().from("kensa_questions").select("id,category,group_key,question,correct_index,explanation").eq("active", true),
  ) as Q[];
  const groups = new Map<string, Q[]>();
  for (const q of all) {
    const key = q.group_key || q.id;
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  return shuffle([...groups.values()])
    .slice(0, count)
    .map((variants) => variants[crypto.randomInt(variants.length)]);
}

/**
 * 検査員の「現在の」本番申請：
 * 承認待ち、または承認済みで受験日が今日以降のもの（受験日を過ぎた承認は期限切れとして扱う）
 */
export async function openRequest(inspectorId: string): Promise<TestRequest | null> {
  const rows = must(
    await db()
      .from("kensa_test_requests")
      .select("id,exam_date,status,admin_comment,created_at")
      .eq("inspector_id", inspectorId)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false }),
  ) as TestRequest[];
  return rows.find((r) => r.status === "pending" || r.exam_date >= todayJst()) ?? null;
}

/** 申請に紐づく受験記録 */
export async function attemptForRequest(requestId: string) {
  return maybe(
    await db().from("kensa_test_attempts").select("id,question_ids,answers,submitted_at,total").eq("request_id", requestId).maybeSingle(),
  ) as { id: string; question_ids: string[]; answers: Record<string, number> | null; submitted_at: string | null; total: number } | null;
}
