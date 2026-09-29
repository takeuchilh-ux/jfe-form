import { handle, body, str, int, isDate, bad } from "@/lib/api";
import { currentInspector } from "@/lib/inspector";
import { db, must } from "@/lib/supabase";
import { sendMail, ORDER_MAIL_TO } from "@/lib/mail";
import { ORDER_MAIL_SUBJECT, ORDER_PRODUCTS, orderMailBody, type OrderItem } from "@/lib/order";
import { todayJst } from "@/lib/format";

/** 自分の発注履歴（直近 20 件） */
export const GET = handle(async () => {
  const me = await currentInspector({ only: "inspector" });
  const [orders, profile] = await Promise.all([
    db().from("kensa_orders").select("id,company,items,delivery,note,mail_status,created_at").eq("inspector_id", me.id).order("created_at", { ascending: false }).limit(20),
    db().from("kensa_orders").select("company").eq("inspector_id", me.id).neq("company", "").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { orders: must(orders), lastCompany: profile.data?.company ?? "" };
});

/** 発注：内容を保存し、指定先へメールを送信する */
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

  const person = must(await db().from("kensa_inspectors").select("name,last_name,email").eq("id", me.id).single());
  const order = must(
    await db()
      .from("kensa_orders")
      .insert({ inspector_id: me.id, inspector_name: person.name, company, items, delivery, note })
      .select("id")
      .single(),
  );

  try {
    await sendMail({
      to: ORDER_MAIL_TO,
      subject: ORDER_MAIL_SUBJECT,
      text: orderMailBody({ company, lastName: person.last_name || person.name, items, note, delivery: delivery as string }),
      replyTo: person.email,
    });
    await db().from("kensa_orders").update({ mail_status: "sent" }).eq("id", order.id).select("id");
    return { ok: true, sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("order mail error", msg);
    await db().from("kensa_orders").update({ mail_status: "failed", mail_error: msg.slice(0, 500) }).eq("id", order.id).select("id");
    return { ok: true, sent: false, error: "発注内容は保存しましたが、メールを送信できませんでした。管理者にお知らせください。" };
  }
});
