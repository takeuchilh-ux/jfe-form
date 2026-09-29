import { handle, body, str, int, isDate, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must } from "@/lib/supabase";
import { ORDER_PRODUCTS, type OrderItem } from "@/lib/order";
import { todayJst } from "@/lib/format";

/** 自分の発注履歴（直近 20 件）と、メール本文に使う名字・前回の会社名 */
export const GET = handle(async () => {
  const me = await currentInspector({ only: "inspector" });
  const [orders, last, person] = await Promise.all([
    db().from("kensa_orders").select("id,company,items,delivery,note,mail_status,created_at").eq("inspector_id", me.id).order("created_at", { ascending: false }).limit(20),
    db().from("kensa_orders").select("company").eq("inspector_id", me.id).neq("company", "").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("kensa_inspectors").select("last_name,name").eq("id", me.id).single(),
  ]);
  return {
    orders: must(orders),
    lastCompany: last.data?.company ?? "",
    lastName: person.data?.last_name || person.data?.name?.split(/\s/)[0] || "",
  };
});

/**
 * 発注の記録。メールは端末のメールアプリ（mailto:）で作成・送信するため、ここでは内容を保存するだけ
 * （状態は draft＝メールアプリで作成）。
 */
export const POST = handle(async (req: Request) => {
  const me = await currentInspector({ only: "inspector" });
  const b = await body<{ company?: unknown; items?: { name?: unknown; qty?: unknown }[]; delivery?: unknown; note?: unknown }>(req);
  const company = str(b.company, 100);
  const note = str(b.note, 1000);
  const items: OrderItem[] = (b.items ?? [])
    .map((i) => ({ name: str(i.name, 50), qty: int(i.qty, 0) }))
    .filter((i) => (ORDER_PRODUCTS as readonly string[]).includes(i.name) && i.qty > 0);
  if (!items.length) bad("発注する商品の個数を入力してください");
  if (items.some((i) => i.qty > 9999)) bad("個数が多すぎます");
  const delivery = b.delivery === "asap" ? "asap" : b.delivery;
  if (delivery !== "asap") {
    if (!isDate(delivery)) bad("納品希望日を選択してください");
    if (delivery < todayJst()) bad("納品希望日は今日以降の日付を選択してください");
  }
  const person = must(await db().from("kensa_inspectors").select("name").eq("id", me.id).single());
  must(
    await db()
      .from("kensa_orders")
      .insert({ inspector_id: me.id, inspector_name: person.name, company, items, delivery, note, mail_status: "draft" })
      .select("id"),
  );
  return { ok: true };
});
