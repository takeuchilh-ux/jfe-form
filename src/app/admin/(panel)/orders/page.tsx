import { db, must } from "@/lib/supabase";
import { mailConfigured, ORDER_MAIL_TO } from "@/lib/mail";
import OrdersClient, { type OrderRow } from "./OrdersClient";

export default async function OrdersPage() {
  const rows = must(
    await db().from("kensa_orders").select("id,inspector_name,company,items,delivery,note,mail_status,mail_error,created_at").order("created_at", { ascending: false }).limit(200),
  ) as OrderRow[];
  return (
    <>
      <h1>備品の発注</h1>
      <p className="muted small">
        検査員が LINE の「発注」から作成した内容です。メールは検査員のスマホのメールアプリで作成・送信されます（宛先：<code>{ORDER_MAIL_TO}</code>）。
      </p>
      <OrdersClient rows={rows} canSend={mailConfigured()} />
    </>
  );
}
