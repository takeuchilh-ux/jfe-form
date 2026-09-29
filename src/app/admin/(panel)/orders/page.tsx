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
        検査員が LINE の「発注」から送信した内容です。メールの送信先：<code>{ORDER_MAIL_TO}</code>
      </p>
      {!mailConfigured() && <div className="alert warn">メール送信が未設定です。「設定」→「メール送信」を確認してください。</div>}
      <OrdersClient rows={rows} />
    </>
  );
}
