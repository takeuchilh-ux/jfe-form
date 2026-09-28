"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import type { Inspector } from "@/lib/data";
import ProfileFields, { type ProfileForm } from "@/components/ProfileFields";

type Form = ProfileForm & { area: string; notes: string };

function toForm(i: Inspector): Form {
  return {
    last_name: i.last_name,
    first_name: i.first_name,
    phone: i.phone,
    email: i.email,
    address: i.address,
    bank_name: i.bank_name,
    branch_name: i.branch_name,
    branch_number: i.branch_number,
    account_type: i.account_type,
    account_number: i.account_number,
    account_holder: i.account_holder,
    area: i.area,
    notes: i.notes,
  };
}

function status(i: Inspector) {
  if (!i.active) return <span className="badge">無効</span>;
  if (!i.approved_at) return <span className="badge warn">承認待ち</span>;
  return <span className="badge ok">承認済</span>;
}

export default function InspectorsClient({ inspectors, addUrl }: { inspectors: Inspector[]; addUrl: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Inspector | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = inspectors.filter((i) => i.active && !i.approved_at);

  function open(i: Inspector) {
    setEditing(i);
    setForm(toForm(i));
    setMsg(null);
  }

  async function patch(id: string, body: Record<string, unknown>, close = true) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ lineError: string | null }>(`/api/admin/inspectors/${id}`, { method: "PATCH", body });
      if (r.lineError) setMsg({ type: "warn", text: `保存しましたが LINE 通知に失敗しました：${r.lineError}` });
      if (close) setEditing(null);
      router.refresh();
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <p style={{ margin: 0 }}>
          検査員は公式 LINE を友だち追加し、基本情報を登録すると「承認待ち」として表示されます。内容を確認して承認してください。
          {addUrl && (
            <>
              <br />
              友だち追加 URL：<code>{addUrl}</code>{" "}
              <button className="btn sm" onClick={() => navigator.clipboard.writeText(addUrl).then(() => alert("コピーしました"))}>
                コピー
              </button>
            </>
          )}
        </p>
      </div>
      {msg && !editing && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {pending.length > 0 && <div className="alert warn">承認待ちの検査員が {pending.length} 名います。</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>氏名</th>
              <th>状態</th>
              <th>連絡先</th>
              <th>口座</th>
              <th>登録日</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inspectors.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  まだ登録がありません
                </td>
              </tr>
            )}
            {inspectors.map((i) => (
              <tr key={i.id} className={i.active ? "" : "dim"}>
                <td>
                  {i.name}
                  {i.line_display_name && <div className="muted small">LINE: {i.line_display_name}</div>}
                </td>
                <td>{status(i)}</td>
                <td className="small">
                  {i.phone}
                  <br />
                  {i.email}
                </td>
                <td className="small">
                  {i.bank_name} {i.branch_name}
                  <br />
                  {i.account_type} {i.account_number} {i.account_holder}
                </td>
                <td className="small nowrap">{new Date(i.created_at).toLocaleDateString("ja-JP")}</td>
                <td className="nowrap">
                  {i.active && !i.approved_at && (
                    <button className="btn sm primary" disabled={busy} onClick={() => confirm(`${i.name} さんを承認しますか？（LINE で通知されます）`) && patch(i.id, { approve: true })}>
                      承認
                    </button>
                  )}{" "}
                  <button className="btn sm" onClick={() => open(i)}>
                    詳細・編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && form && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>
              {editing.name} {status(editing)}
            </h2>
            {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                patch(editing.id, form);
              }}
            >
              <ProfileFields value={form} onChange={(v) => setForm({ ...form, ...v })} />
              <h3 className="mt">管理用</h3>
              <label className="field">
                <span>担当エリア</span>
                <input type="text" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </label>
              <label className="field">
                <span>メモ（検査員には表示されません）</span>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
              <div className="row">
                <button className="btn primary" disabled={busy}>
                  保存
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  キャンセル
                </button>
                <span className="grow" />
                <button type="button" className="btn sm" disabled={busy} onClick={() => patch(editing.id, { active: !editing.active })}>
                  {editing.active ? "無効にする（退職など）" : "有効に戻す"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
