"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg, parseCsv } from "@/lib/client";
import CsvTools from "@/components/CsvTools";
import type { Store } from "@/lib/data";

type Form = { name: string; group_name: string; area: string; address: string; notes: string };
const EMPTY: Form = { name: "", group_name: "", area: "", address: "", notes: "" };

export default function StoresClient({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Store | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [csv, setCsv] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const k = q.trim();
    return k ? stores.filter((s) => [s.name, s.group_name, s.area, s.address].some((v) => v.includes(k))) : stores;
  }, [q, stores]);

  function open(s: Store | "new") {
    setEditing(s);
    setError("");
    setForm(s === "new" ? EMPTY : { name: s.name, group_name: s.group_name, area: s.area, address: s.address, notes: s.notes });
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditing(null);
      setCsv(null);
      router.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const csvRows = csv
    ? parseCsv(csv)
        .filter((r) => r[0] && r[0] !== "店舗名")
        .map((r) => ({ name: r[0], group_name: r[1] ?? "", area: r[2] ?? "", address: r[3] ?? "" }))
    : [];

  return (
    <>
      {error && !editing && <div className="alert error">{error}</div>}
      <div className="row between" style={{ marginBottom: 12 }}>
        <input type="text" placeholder="店舗名・運営会社・エリアで検索" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <div className="row">
          <button className="btn" onClick={() => setCsv(csv === null ? "" : null)}>
            CSV 一括登録
          </button>
          <button className="btn primary" onClick={() => open("new")}>
            ＋ 店舗を追加
          </button>
        </div>
      </div>
      {csv !== null && (
        <div className="card">
          <p className="muted">「店舗名,運営会社,エリア,住所」の順で貼り付けてください。</p>
          <CsvTools
            filename="店舗マスタ.csv"
            template={[
              ["店舗名", "運営会社", "エリア", "住所"],
              ["〇〇食堂 横浜駅前店", "株式会社〇〇", "横浜", "神奈川県横浜市西区〇〇1-2-3"],
            ]}
            onLoad={setCsv}
          />
          <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
          <button
            className="btn primary mt"
            disabled={busy || !csvRows.length}
            onClick={() => act(() => api("/api/admin/stores/import", { body: { rows: csvRows } }))}
          >
            {csvRows.length} 件を登録
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>店舗名</th>
              <th>運営会社</th>
              <th>エリア</th>
              <th>住所</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className={s.active ? "" : "dim"}>
                <td>
                  {s.name}
                  {!s.active && <span className="badge"> 無効</span>}
                </td>
                <td className="small">{s.group_name}</td>
                <td className="nowrap">{s.area}</td>
                <td className="small">{s.address}</td>
                <td>
                  <button className="btn sm" onClick={() => open(s)}>
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small mt">{filtered.length} 件</p>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing === "new" ? "店舗を追加" : "店舗を編集"}</h2>
            {error && <div className="alert error">{error}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(() =>
                  editing === "new"
                    ? api("/api/admin/stores", { body: form })
                    : api(`/api/admin/stores/${editing.id}`, { method: "PATCH", body: form }),
                );
              }}
            >
              {(
                [
                  ["name", "店舗名 *"],
                  ["group_name", "運営会社"],
                  ["area", "エリア"],
                  ["address", "住所"],
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
                <span className="grow" />
                {editing !== "new" && (
                  <button
                    type="button"
                    className="btn sm"
                    disabled={busy}
                    onClick={() => act(() => api(`/api/admin/stores/${editing.id}`, { method: "PATCH", body: { active: !editing.active } }))}
                  >
                    {editing.active ? "無効にする" : "有効に戻す"}
                  </button>
                )}
                {editing !== "new" && (
                  <button
                    type="button"
                    className="btn sm danger"
                    disabled={busy}
                    onClick={() => confirm(`「${editing.name}」を削除しますか？`) && act(() => api(`/api/admin/stores/${editing.id}`, { method: "DELETE" }))}
                  >
                    削除
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
