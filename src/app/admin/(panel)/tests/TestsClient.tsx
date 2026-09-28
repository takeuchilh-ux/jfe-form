"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg, parseCsv } from "@/lib/client";
import type { Settings } from "@/lib/data";
import { fmtDate, todayJst } from "@/lib/format";

export type Question = {
  id: string;
  sort_order: number;
  category: string;
  group_key: string;
  question: string;
  correct_index: number;
  explanation: string;
  active: boolean;
};
export type ExamRequest = {
  id: string;
  exam_date: string;
  status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
  admin_comment: string;
  created_at: string;
  inspector: { name: string } | null;
  attempt: { score: number | null; total: number; passed: boolean | null; submitted_at: string | null }[] | { score: number | null; total: number; passed: boolean | null; submitted_at: string | null } | null;
};
export type Attempt = { id: string; score: number; total: number; passed: boolean; submitted_at: string; inspector: { name: string } | null };

type Form = { category: string; group_key: string; question: string; correct_index: number; explanation: string; sort_order: number };
const MARK = ["○", "×"];

type Tab = "questions" | "requests" | "results";

export default function TestsClient({
  initialTab,
  questions,
  attempts,
  requests,
  settings,
}: {
  initialTab: Tab;
  questions: Question[];
  attempts: Attempt[];
  requests: ExamRequest[];
  settings: Settings;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const active = questions.filter((x) => x.active);
  const themeCount = new Set(active.map((x) => x.group_key || x.id)).size;
  const filtered = useMemo(() => {
    const k = q.trim();
    return k ? questions.filter((x) => [x.question, x.category, x.group_key].some((v) => v.includes(k))) : questions;
  }, [q, questions]);

  function open(x: Question | "new") {
    setEditing(x);
    setMsg(null);
    setForm(
      x === "new"
        ? { category: "", group_key: "", question: "", correct_index: 0, explanation: "", sort_order: (questions.at(-1)?.sort_order ?? 0) + 1 }
        : { category: x.category, group_key: x.group_key, question: x.question, correct_index: x.correct_index, explanation: x.explanation, sort_order: x.sort_order },
    );
  }

  async function act(fn: () => Promise<unknown>, success?: (r: unknown) => string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setEditing(null);
      setCsv(null);
      if (success) setMsg({ type: "success", text: success(r) });
      router.refresh();
    } catch (e) {
      setMsg({ type: "error", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  // CSV: カテゴリ,テーマ,問題文,正解(○/×),解説
  const csvRows = csv
    ? parseCsv(csv)
        .filter((r) => r[2] && r[2] !== "問題文")
        .map((r) => ({ category: r[0], group_key: r[1], question: r[2], correct: r[3], explanation: r[4] ?? "" }))
    : [];

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={tab === "questions" ? "on" : ""} onClick={() => setTab("questions")}>
            問題（{questions.length}）
          </button>
          <button className={tab === "requests" ? "on" : ""} onClick={() => setTab("requests")}>
            本番申請{pendingCount > 0 ? `（承認待ち ${pendingCount}）` : ""}
          </button>
          <button className={tab === "results" ? "on" : ""} onClick={() => setTab("results")}>
            本番結果（{attempts.length}）
          </button>
        </div>
        <span className="muted">
          ○×方式／出題 {settings.test_question_count} 問（{themeCount} テーマからランダム）／合格 {settings.test_pass_score} 点以上／練習は何回でも・本番は申請承認制
        </span>
      </div>
      {msg && !editing && <div className={`alert ${msg.type}`}>{msg.text}</div>}

      {tab === "questions" && (
        <>
          {questions.length === 0 && (
            <div className="card">
              <p>
                問題が登録されていません。「衛生巡回サービス手順書」から作成した○×問題（95 テーマ・190 問）を登録できます。
              </p>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => act(() => api<{ count: number }>("/api/admin/questions/defaults", { method: "POST" }), (r) => `${(r as { count: number }).count} 問を登録しました`)}
              >
                手順書の問題を登録する
              </button>
            </div>
          )}
          {questions.length > 0 && themeCount < settings.test_question_count && (
            <div className="alert warn">
              有効なテーマ数（{themeCount}）が出題数（{settings.test_question_count} 問）に足りません。現在は {themeCount} 問が出題されます。
            </div>
          )}
          <div className="card small muted">
            同じ「テーマ」の問題（例：正しい文と誤った文）は、1 回のテストで 1 問だけランダムに出題されます。テーマが空欄の問題は単独で扱います。
          </div>
          <div className="row between" style={{ marginBottom: 12 }}>
            <input type="text" placeholder="問題文・カテゴリ・テーマで検索" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
            <div className="row">
              <button className="btn" onClick={() => setCsv(csv === null ? "" : null)}>
                CSV 一括登録
              </button>
              <button className="btn primary" onClick={() => open("new")}>
                ＋ 問題を追加
              </button>
            </div>
          </div>
          {csv !== null && (
            <div className="card">
              <p className="muted">「カテゴリ,テーマ,問題文,正解(○ または ×),解説」の順で貼り付けてください。</p>
              <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
              <button
                className="btn primary mt"
                disabled={busy || !csvRows.length}
                onClick={() => act(() => api<{ count: number }>("/api/admin/questions/import", { body: { rows: csvRows } }), (r) => `${(r as { count: number }).count} 問を登録しました`)}
              >
                {csvRows.length} 問を登録
              </button>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>カテゴリ</th>
                  <th>テーマ</th>
                  <th>問題</th>
                  <th>正解</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.id} className={x.active ? "" : "dim"}>
                    <td>{x.sort_order}</td>
                    <td className="nowrap">{x.category}</td>
                    <td className="small muted">{x.group_key}</td>
                    <td>{x.question}</td>
                    <td style={{ fontSize: 18, color: x.correct_index === 0 ? "var(--primary)" : "var(--danger)" }}>{MARK[x.correct_index]}</td>
                    <td className="nowrap">
                      <button className="btn sm" onClick={() => open(x)}>
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "requests" && <RequestsTable requests={requests} busy={busy} act={act} />}

      {tab === "results" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>受験日時</th>
                <th>検査員</th>
                <th className="right">得点</th>
                <th>判定</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attempts.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    まだ受験結果がありません
                  </td>
                </tr>
              )}
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.submitted_at).toLocaleString("ja-JP")}</td>
                  <td>{a.inspector?.name}</td>
                  <td className="right">
                    {a.score} / {a.total}
                  </td>
                  <td>{a.passed ? <span className="badge ok">合格</span> : <span className="badge ng">不合格</span>}</td>
                  <td>
                    <button
                      className="btn sm danger"
                      disabled={busy}
                      onClick={() =>
                        confirm(`${a.inspector?.name} さんのこの結果を削除しますか？（申請も削除され、再申請できる状態に戻ります）`) &&
                        act(() => api(`/api/admin/test-attempts/${a.id}`, { method: "DELETE" }), () => "結果を削除しました")
                      }
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && form && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing === "new" ? "問題を追加" : "問題を編集"}</h2>
            {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act(() => (editing === "new" ? api("/api/admin/questions", { body: form }) : api(`/api/admin/questions/${editing.id}`, { method: "PATCH", body: form })));
              }}
            >
              <div className="row">
                <label className="field" style={{ width: 80 }}>
                  <span>番号</span>
                  <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
                </label>
                <label className="field grow">
                  <span>カテゴリ</span>
                  <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </label>
                <label className="field grow">
                  <span>テーマ（同じテーマは 1 問だけ出題）</span>
                  <input type="text" value={form.group_key} onChange={(e) => setForm({ ...form, group_key: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span>問題文 *</span>
                <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} required />
              </label>
              <div className="field">
                <span className="muted small" style={{ fontWeight: 600 }}>
                  正解
                </span>
                <div className="seg" style={{ display: "flex", maxWidth: 240 }}>
                  {[0, 1].map((i) => (
                    <button type="button" key={i} style={{ flex: 1, fontSize: 20 }} className={form.correct_index === i ? "on" : ""} onClick={() => setForm({ ...form, correct_index: i })}>
                      {MARK[i]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>解説（間違えたときに表示）</span>
                <textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
              </label>
              <div className="row">
                <button className="btn primary" disabled={busy}>
                  保存
                </button>
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  キャンセル
                </button>
                <span className="grow" />
                {editing !== "new" && (
                  <>
                    <button
                      type="button"
                      className="btn sm"
                      disabled={busy}
                      onClick={() => act(() => api(`/api/admin/questions/${editing.id}`, { method: "PATCH", body: { active: !editing.active } }))}
                    >
                      {editing.active ? "出題しない" : "出題する"}
                    </button>
                    <button
                      type="button"
                      className="btn sm danger"
                      disabled={busy}
                      onClick={() => confirm("この問題を削除しますか？") && act(() => api(`/api/admin/questions/${editing.id}`, { method: "DELETE" }))}
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const REQ_STATUS: Record<ExamRequest["status"], [string, string]> = {
  pending: ["承認待ち", "warn"],
  approved: ["承認済み", "ok"],
  rejected: ["却下", "ng"],
  completed: ["受験済み", "info"],
  cancelled: ["取り下げ", ""],
};

function RequestsTable({
  requests,
  busy,
  act,
}: {
  requests: ExamRequest[];
  busy: boolean;
  act: (fn: () => Promise<unknown>, success?: (r: unknown) => string) => void;
}) {
  const [dates, setDates] = useState<Record<string, string>>({});
  const today = todayJst();

  function decide(r: ExamRequest, action: "approve" | "reject") {
    const exam_date = dates[r.id] ?? r.exam_date;
    let admin_comment = "";
    if (action === "reject") {
      const c = prompt("却下の理由（検査員に LINE で通知されます。空欄でも可）", "");
      if (c === null) return;
      admin_comment = c;
    } else if (!confirm(`${r.inspector?.name} さんの本番テストを ${fmtDate(exam_date)} で承認します（LINE で通知されます）。`)) {
      return;
    }
    act(
      () => api<{ lineError: string | null }>(`/api/admin/test-requests/${r.id}`, { method: "PATCH", body: { action, exam_date, admin_comment } }),
      (res) => {
        const e = (res as { lineError: string | null }).lineError;
        return e ? `保存しましたが LINE 通知に失敗しました：${e}` : action === "approve" ? "承認し、LINE で通知しました" : "却下し、LINE で通知しました";
      },
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>申請日</th>
            <th>検査員</th>
            <th>受験日</th>
            <th>状態</th>
            <th>結果</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {requests.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                申請はまだありません
              </td>
            </tr>
          )}
          {requests.map((r) => {
            const attempt = Array.isArray(r.attempt) ? r.attempt[0] : r.attempt;
            const expired = r.status === "approved" && r.exam_date < today;
            const [label, cls] = expired ? ["期限切れ（未受験）", ""] : REQ_STATUS[r.status];
            const editable = r.status === "pending" || (r.status === "approved" && !expired && !attempt);
            return (
              <tr key={r.id} className={r.status === "cancelled" || expired ? "dim" : ""}>
                <td className="nowrap small">{new Date(r.created_at).toLocaleDateString("ja-JP")}</td>
                <td className="nowrap">{r.inspector?.name}</td>
                <td className="nowrap">
                  {editable ? (
                    <input
                      type="date"
                      className="inline"
                      min={today}
                      value={dates[r.id] ?? r.exam_date}
                      onChange={(e) => setDates({ ...dates, [r.id]: e.target.value })}
                    />
                  ) : (
                    fmtDate(r.exam_date)
                  )}
                </td>
                <td>
                  <span className={`badge ${cls}`}>{label}</span>
                  {r.status === "approved" && attempt && !attempt.submitted_at && <span className="badge info"> 受験中</span>}
                  {r.admin_comment && <div className="small muted">{r.admin_comment}</div>}
                </td>
                <td className="nowrap">
                  {attempt?.submitted_at ? (
                    <>
                      {attempt.score} / {attempt.total} {attempt.passed ? <span className="badge ok">合格</span> : <span className="badge ng">不合格</span>}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="nowrap">
                  {editable && (
                    <>
                      <button className="btn sm primary" disabled={busy} onClick={() => decide(r, "approve")}>
                        {r.status === "approved" ? "日付を変更" : "承認"}
                      </button>{" "}
                      <button className="btn sm danger" disabled={busy} onClick={() => decide(r, "reject")}>
                        却下
                      </button>{" "}
                    </>
                  )}
                  <button
                    className="btn sm"
                    disabled={busy}
                    onClick={() =>
                      confirm(`${r.inspector?.name} さんのこの申請を削除しますか？${attempt ? "（本番の結果も削除されます）" : ""}`) &&
                      act(() => api(`/api/admin/test-requests/${r.id}`, { method: "DELETE" }), () => "申請を削除しました")
                    }
                  >
                    削除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
