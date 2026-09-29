import { handle } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import { db, must } from "@/lib/supabase";
import { sendMail, ORDER_MAIL_TO } from "@/lib/mail";
import { ORDER_MAIL_SUBJECT, orderMailBody, type OrderItem } from "@/lib/order";

type Ctx = { params: Promise<{ id: string }> };

/** 発注メールを再送する */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const o = must(
    await db().from("kensa_orders").select("company,items,delivery,note,inspector_name,inspector:kensa_inspectors(last_name,email)").eq("id", id).single(),
  ) as unknown as { company: string; items: OrderItem[]; delivery: string; note: string; inspector_name: string; inspector: { last_name: string; email: string } | null };
  try {
    await sendMail({
      to: ORDER_MAIL_TO,
      subject: ORDER_MAIL_SUBJECT,
      text: orderMailBody({ company: o.company, lastName: o.inspector?.last_name || o.inspector_name.split(/\s/)[0], items: o.items, note: o.note, delivery: o.delivery }),
      replyTo: o.inspector?.email,
    });
    must(await db().from("kensa_orders").update({ mail_status: "sent", mail_error: "" }).eq("id", id).select("id"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    must(await db().from("kensa_orders").update({ mail_status: "failed", mail_error: msg.slice(0, 500) }).eq("id", id).select("id"));
    throw new Error(`送信できませんでした：${msg}`);
  }
});

/** 発注の記録を削除 */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  must(await db().from("kensa_orders").delete().eq("id", id).select("id"));
});
