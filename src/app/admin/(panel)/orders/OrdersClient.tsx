"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import { deliveryText, type OrderItem } from "@/lib/order";

export type OrderRow = {
  id: string;
  inspector_name: string;
  company: string;
  items: OrderItem[];
  delivery: string;
  note: string;
  mail_status: string;
  mail_error: string;
  created_at: string;
};

export default function OrdersClient({ rows }: { rows: OrderRow[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ type: "success", text: ok });
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日時</th>
              <th>発注者</th>
              <th>商品</th>
              <th>納品希望日</th>
              <th>備考</th>
              <th>メール</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  発注はまだありません
                </td>
              </tr>
            )}
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="nowrap small">{new Date(o.created_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                <td>
                  {o.inspector_name}
                  {o.company && <div className="muted small">{o.company}</div>}
                </td>
                <td className="small">
                  {o.items.map((i) => (
                    <div key={i.name}>
                      {i.name} × {i.qty}
                    </div>
                  ))}
                </td>
                <td className="nowrap">{deliveryText(o.delivery)}</td>
                <td className="small">{o.note}</td>
                <td>
                  {o.mail_status === "sent" ? (
                    <span className="badge ok">送信済</span>
                  ) : (
                    <>
                      <span className="badge ng">未送信</span>
                      {o.mail_error && <div className="small muted">{o.mail_error}</div>}
                    </>
                  )}
                </td>
                <td className="nowrap">
                  <button
                    className="btn sm"
                    disabled={busy}
                    onClick={() =>
                      confirm(o.mail_status === "sent" ? "同じ内容のメールをもう一度送信しますか？" : "メールを送信しますか？") &&
                      act(() => api(`/api/admin/orders/${o.id}`, { method: "POST" }), "メールを送信しました")
                    }
                  >
                    {o.mail_status === "sent" ? "再送" : "送信"}
                  </button>{" "}
                  <button className="btn sm danger" disabled={busy} onClick={() => confirm("この発注の記録を削除しますか？") && act(() => api(`/api/admin/orders/${o.id}`, { method: "DELETE" }), "削除しました")}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
