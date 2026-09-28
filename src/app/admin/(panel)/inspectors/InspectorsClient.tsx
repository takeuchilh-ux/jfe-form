"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg } from "@/lib/client";
import type { Inspector } from "@/lib/data";

type Form = { name: string; name_kana: string; phone: string; email: string; area: string; notes: string };
const EMPTY: Form = { name: "", name_kana: "", phone: "", email: "", area: "", notes: "" };

export default function InspectorsClient({ inspectors, addUrl }: { inspectors: Inspector[]; addUrl: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Inspector | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function open(i: Inspector | "new") {
    setEditing(i);
    setError("");
    setForm(i === "new" ? EMPTY : { name: i.name, name_kana: i.name_kana, phone: i.phone, email: i.email, area: i.area, notes: i.notes });
  }

  async function save(extra: Record<string, unknown> = {}, close = true) {
    setBusy(true);
    setError("");
    try {
      if (editing === "new") await api("/api/admin/inspectors", { body: form });
      else if (editing) await api(`/api/admin/inspectors/${editing.id}`, { method: "PATCH", body: { ...form, ...extra } });
      if (close) setEditing(null);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function copyGuide(i: Inspector) {
    const text = [
      `${i.name} 様`,
      "衛生検査の LINE 公式アカウントとの連携をお願いします。",
      addUrl ? `① 友だち追加：${addUrl}` : "① 公式 LINE を友だち追加",
      "② メニューを開き、表示された画面で下記の連携コードを入力",
      `連携コード：${i.link_code}`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => alert("案内文をコピーしました"));
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0 }}>
          検査員を登録すると「連携コード」が発行されます。検査員が公式 LINE でコードを入力すると LINE と紐づきます。
        </p>
        <button className="btn primary" onClick={() => open("new")}>
          ＋ 検査員を追加
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>氏名</th>
              <th>エリア</th>
              <th>連絡先</th>
              <th>LINE 連携</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inspectors.map((i) => (
              <tr key={i.id} className={i.active ? "" : "dim"}>
                <td>
                  {i.name}
                  {!i.active && <span className="badge"> 無効</span>}
                  <div className="muted small">{i.name_kana}</div>
                </td>
                <td>{i.area}</td>
                <td className="small">
                  {i.phone}
                  <br />
                  {i.email}
                </td>
                <td>
                  {i.line_user_id ? (
                    <span className="badge ok">連携済 {i.line_display_name && `(${i.line_display_name})`}</span>
                  ) : (
                    <>
                      <span className="badge warn">未連携</span> <code>{i.link_code}</code>{" "}
                      <button className="btn sm" onClick={() => copyGuide(i)}>
                        案内文コピー
                      </button>
                    </>
                  )}
                </td>
                <td>
                  <button className="btn sm" onClick={() => open(i)}>
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing === "new" ? "検査員を追加" : "検査員を編集"}</h2>
            {error && <div className="alert error">{error}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              {(
                [
                  ["name", "氏名 *"],
                  ["name_kana", "ふりがな"],
                  ["phone", "電話番号"],
                  ["email", "メールアドレス"],
                  ["area", "担当エリア"],
                  ["notes", "メモ"],
                ] as [keyof Form, string][]
              ).map(([k, label]) => (
                <label className="field" key={k}>
                  <span>{label}</span>
                  <input type="text" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} required={k === "name"} />
                </label>
              ))}
              <div className="row">
                <button className="btn primary" disabled={busy}>
                  保存
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  キャンセル
                </button>
              </div>
            </form>
            {editing !== "new" && (
              <div className="row mt" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                {editing.line_user_id ? (
                  <button
                    className="btn sm danger"
                    disabled={busy}
                    onClick={() => confirm("LINE 連携を解除し、新しい連携コードを発行します。よろしいですか？") && save({ unlink: true })}
                  >
                    LINE 連携を解除
                  </button>
                ) : (
                  <button className="btn sm" disabled={busy} onClick={() => save({ regenerate_code: true })}>
                    連携コードを再発行
                  </button>
                )}
                <button className="btn sm" disabled={busy} onClick={() => save({ active: !editing.active })}>
                  {editing.active ? "無効にする（退職など）" : "有効に戻す"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
