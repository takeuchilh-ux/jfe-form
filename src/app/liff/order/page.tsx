"use client";

import { useEffect, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import { api, errMsg } from "@/lib/client";
import { todayJst } from "@/lib/format";
import { ORDER_MAIL_SUBJECT, ORDER_MAIL_TO, ORDER_PRODUCTS, deliveryText, orderMailBody, orderMailtoUrl, type OrderItem } from "@/lib/order";

type Order = { id: string; company: string; items: OrderItem[]; delivery: string; note: string; mail_status: string; created_at: string };

/** 発注（検査員向け）：備品の個数を入力して、指定先へメールで発注する */
export default function OrderPage() {
  const { me } = useMe();
  const [company, setCompany] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [deliveryMode, setDeliveryMode] = useState<"asap" | "date">("asap");
  const [date, setDate] = useState(todayJst());
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<Order[] | null>(null);
  const [lastName, setLastName] = useState(me.name.split(/\s/)[0]);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ orders: Order[]; lastCompany: string; lastName: string }>("/api/liff/orders")
      .then((r) => {
        setHistory(r.orders);
        setCompany((c) => c || r.lastCompany);
        if (r.lastName) setLastName(r.lastName);
      })
      .catch((e) => setMsg({ type: "error", text: errMsg(e) }));
  useEffect(() => {
    if (me.kind === "inspector") load();
  }, [me.kind]);

  if (me.kind !== "inspector") {
    return (
      <main className="liff">
        <LiffHeader title="発注" />
        <div className="alert warn">この機能は検査員向けです。</div>
      </main>
    );
  }

  const items: OrderItem[] = ORDER_PRODUCTS.map((name) => ({ name, qty: qty[name] ?? 0 })).filter((i) => i.qty > 0);
  const delivery = deliveryMode === "asap" ? "asap" : date;
  const setN = (name: string, n: number) => setQty({ ...qty, [name]: Math.max(0, Math.min(9999, Math.round(n) || 0)) });

  const mailBody = orderMailBody({ company, lastName, items, note, delivery });

  /** メールアプリを開くのと同時に、発注内容を記録する（画面はそのまま残る） */
  function recordOrder() {
    setBusy(true);
    setMsg(null);
    api("/api/liff/orders", { body: { company, items, delivery, note } })
      .then(() => {
        setMsg({ type: "success", text: "メールアプリで下書きを作成しました。内容を確認して送信してください。" });
        setQty({});
        setNote("");
        setDeliveryMode("asap");
        setConfirming(false);
        load();
      })
      .catch((e) => setMsg({ type: "error", text: errMsg(e) }))
      .finally(() => {
        setBusy(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ type: "success", text: `${label}をコピーしました` });
    } catch {
      setMsg({ type: "error", text: "コピーできませんでした" });
    }
  }

  // 確認画面
  if (confirming) {
    return (
      <main className="liff">
        <div className="liff-header">
          <button className="btn sm" onClick={() => setConfirming(false)}>
            ‹ 修正する
          </button>
          <h1>発注内容の確認</h1>
        </div>
        {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
        <div className="card">
          <h3>商品</h3>
          {items.map((i) => (
            <div key={i.name} className="row between" style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
              <span>{i.name}</span>
              <strong>× {i.qty}</strong>
            </div>
          ))}
          <p className="mt small">
            納品希望日：<strong>{deliveryText(delivery)}</strong>
          </p>
          {note && <p className="small">備考：{note}</p>}
        </div>
        <details className="acc">
          <summary>
            <span className="grow small">作成されるメールを見る</span>
          </summary>
          <div className="acc-body">
            <pre className="mail-preview">{`宛先：${ORDER_MAIL_TO}\n件名：${ORDER_MAIL_SUBJECT}\n\n${mailBody}`}</pre>
          </div>
        </details>
        <a className={`btn primary block lg ${busy ? "disabled" : ""}`} href={orderMailtoUrl(mailBody)} onClick={recordOrder}>
          📧 メールアプリで作成する
        </a>
        <p className="small muted mt">
          iPhone は「メール」、Android は既定のメールアプリが開き、宛先・件名・本文が入った状態になります。内容を確認して送信してください。
        </p>
        <details className="acc">
          <summary>
            <span className="grow small">メールアプリが開かない場合</span>
          </summary>
          <div className="acc-body">
            <p className="small">宛先と本文をコピーして、お使いのメールアプリに貼り付けてください。</p>
            <div className="row">
              <button className="btn sm" onClick={() => copy(ORDER_MAIL_TO, "宛先")}>
                宛先をコピー
              </button>
              <button className="btn sm" onClick={() => copy(ORDER_MAIL_SUBJECT, "件名")}>
                件名をコピー
              </button>
              <button className="btn sm" onClick={() => copy(mailBody, "本文")}>
                本文をコピー
              </button>
            </div>
            <button className="btn block mt" disabled={busy} onClick={recordOrder}>
              コピーして送った（発注を記録する）
            </button>
          </div>
        </details>
      </main>
    );
  }

  return (
    <main className="liff">
      <LiffHeader title="備品の発注" />
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      <div className="card">
        <label className="field">
          <span>会社名（任意）</span>
          <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="未入力の場合は名字のみでメールします" />
        </label>
        <div className="field" style={{ marginBottom: 0 }}>
          <span className="muted small" style={{ fontWeight: 600 }}>
            名前
          </span>
          <div style={{ padding: "6px 2px" }}>{me.name}</div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>商品と個数</h3>
          {items.length > 0 && <span className="badge ok">{items.length} 品目</span>}
        </div>
        {ORDER_PRODUCTS.map((name) => {
          const n = qty[name] ?? 0;
          return (
            <div key={name} className={`qty-row ${n > 0 ? "on" : ""}`}>
              <span className="grow">{name}</span>
              <button type="button" className="qty-btn" disabled={n === 0} onClick={() => setN(name, n - 1)} aria-label={`${name}を減らす`}>
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="qty-input"
                value={n || ""}
                placeholder="0"
                onChange={(e) => setN(name, Number(e.target.value))}
              />
              <button type="button" className="qty-btn" onClick={() => setN(name, n + 1)} aria-label={`${name}を増やす`}>
                ＋
              </button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>納品希望日</h3>
        <div className="seg" style={{ display: "flex" }}>
          <button type="button" style={{ flex: 1 }} className={deliveryMode === "asap" ? "on" : ""} onClick={() => setDeliveryMode("asap")}>
            最短
          </button>
          <button type="button" style={{ flex: 1 }} className={deliveryMode === "date" ? "on" : ""} onClick={() => setDeliveryMode("date")}>
            日付を指定
          </button>
        </div>
        {deliveryMode === "date" && <input type="date" className="mt" min={todayJst()} value={date} onChange={(e) => setDate(e.target.value)} />}
      </div>

      <div className="card">
        <label className="field" style={{ marginBottom: 0 }}>
          <span>備考（任意）</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="サイズ指定・届け先など" />
        </label>
      </div>

      <div className="sticky-foot">
        <button className="btn primary block lg" disabled={!items.length || (deliveryMode === "date" && !date)} onClick={() => (setMsg(null), setConfirming(true))}>
          {items.length ? "内容を確認する" : "商品の個数を入力してください"}
        </button>
      </div>

      <details className="acc mt">
        <summary>
          <span className="grow">発注履歴</span>
          {history && history.length > 0 && <span className="badge">{history.length}</span>}
        </summary>
        <div className="acc-body">
          {!history && <p className="muted small">読み込み中…</p>}
          {history?.length === 0 && <p className="muted small">まだ発注はありません。</p>}
          {history?.map((o) => (
            <div key={o.id} className="case-row small">
              <div className="row between">
                <strong>{new Date(o.created_at).toLocaleDateString("ja-JP")}</strong>
                {o.mail_status === "sent" ? <span className="badge ok">送信済</span> : <span className="badge info">メール作成</span>}
              </div>
              <div>{o.items.map((i) => `${i.name}×${i.qty}`).join("、")}</div>
              <div className="muted">納品希望日：{deliveryText(o.delivery)}</div>
            </div>
          ))}
        </div>
      </details>
    </main>
  );
}
