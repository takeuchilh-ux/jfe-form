"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import type { Inspector } from "@/lib/data";
import ProfileFields, { type ProfileForm } from "@/components/ProfileFields";
import { KIND_LABEL } from "@/lib/format";

type Form = ProfileForm & { area: string; notes: string; kind: "inspector" | "trainee" };

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
    kind: i.kind,
  };
}

function KindBadge({ kind }: { kind: Inspector["kind"] }) {
  return <span className={`badge ${kind === "inspector" ? "info" : ""}`}>{KIND_LABEL[kind]}</span>;
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
      if (r.lineError) setMsg({ type: "warn", text: `保存しましたが LINE 側の処理に失敗しました：${r.lineError}` });
      if (close) setEditing(null);
      router.refresh();
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(i: Inspector) {
    if (
      !confirm(
        `${i.name} さんを完全に削除します。\n受注可否の回答・アサイン・交通費申請（レシート含む）・テストの申請と結果もすべて削除され、元に戻せません。\n（退職などで残しておきたい場合は「無効にする」を使ってください）\n\n削除しますか？`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await api(`/api/admin/inspectors/${i.id}`, { method: "DELETE" });
      setEditing(null);
      setMsg({ type: "success", text: `${i.name} さんを削除しました` });
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
              <th>区分</th>
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
                <td colSpan={7} className="muted">
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
                <td>
                  <KindBadge kind={i.kind} />
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
                    <>
                      {(["trainee", "inspector"] as const).map((k) => (
                        <button
                          key={k}
                          className="btn sm primary"
                          style={{ marginRight: 4 }}
                          disabled={busy}
                          onClick={() => confirm(`${i.name} さんを「${KIND_LABEL[k]}」として承認しますか？（LINE で通知され、${KIND_LABEL[k]}用のメニューに切り替わります）`) && patch(i.id, { approve: true, kind: k })}
                        >
                          {KIND_LABEL[k]}で承認
                        </button>
                      ))}
                    </>
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
              {editing.name} <KindBadge kind={editing.kind} /> {status(editing)}
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
              <div className="field">
                <span className="muted small" style={{ fontWeight: 600 }}>
                  区分（LINE のメニューが切り替わります）
                </span>
                <div className="seg" style={{ display: "flex", maxWidth: 280 }}>
                  {(["inspector", "trainee"] as const).map((k) => (
                    <button type="button" key={k} style={{ flex: 1 }} className={form.kind === k ? "on" : ""} onClick={() => setForm({ ...form, kind: k })}>
                      {KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
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
                <button type="button" className="btn sm danger" disabled={busy} onClick={() => remove(editing)}>
                  削除
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
