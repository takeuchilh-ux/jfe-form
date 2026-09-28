"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, errMsg, parseCsv } from "@/lib/client";
import type { Settings } from "@/lib/data";

export type Question = {
  id: string;
  sort_order: number;
  category: string;
  question: string;
  choices: string[];
  correct_index: number;
  explanation: string;
  active: boolean;
};
export type Attempt = { id: string; score: number; total: number; passed: boolean; submitted_at: string; inspector: { name: string } | null };

type Form = { category: string; question: string; choices: string[]; correct_index: number; explanation: string; sort_order: number };

export default function TestsClient({ questions, attempts, settings }: { questions: Question[]; attempts: Attempt[]; settings: Settings }) {
  const router = useRouter();
  const [tab, setTab] = useState<"questions" | "results">("questions");
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeCount = questions.filter((q) => q.active).length;

  function open(q: Question | "new") {
    setEditing(q);
    setError("");
    setForm(
      q === "new"
        ? { category: "", question: "", choices: ["", "", "", ""], correct_index: 0, explanation: "", sort_order: (questions.at(-1)?.sort_order ?? 0) + 1 }
        : { category: q.category, question: q.question, choices: [...q.choices], correct_index: q.correct_index, explanation: q.explanation, sort_order: q.sort_order },
    );
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

  // CSV: カテゴリ,問題文,選択肢1..4,正解番号(1始まり),解説
  const csvRows = csv
    ? parseCsv(csv)
        .filter((r) => r[1] && r[1] !== "問題文")
        .map((r) => ({
          category: r[0],
          question: r[1],
          choices: r.slice(2, 6).filter(Boolean),
          correct_index: Number(r[6]) - 1,
          explanation: r[7] ?? "",
        }))
    : [];

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={tab === "questions" ? "on" : ""} onClick={() => setTab("questions")}>
            問題（{questions.length}）
          </button>
          <button className={tab === "results" ? "on" : ""} onClick={() => setTab("results")}>
            受験結果（{attempts.length}）
          </button>
        </div>
        <span className="muted">
          出題 {settings.test_question_count} 問（有効な問題 {activeCount} 問からランダム）／ 合格 {settings.test_pass_score} 点以上
        </span>
      </div>
      {error && !editing && <div className="alert error">{error}</div>}

      {tab === "questions" && (
        <>
          {activeCount < settings.test_question_count && (
            <div className="alert warn">
              有効な問題が出題数（{settings.test_question_count} 問）に足りません。現在は {activeCount} 問すべてが出題されます。
            </div>
          )}
          <div className="row" style={{ marginBottom: 12, justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setCsv(csv === null ? "" : null)}>
              CSV 一括登録
            </button>
            <button className="btn primary" onClick={() => open("new")}>
              ＋ 問題を追加
            </button>
          </div>
          {csv !== null && (
            <div className="card">
              <p className="muted">「カテゴリ,問題文,選択肢1,選択肢2,選択肢3,選択肢4,正解番号(1〜4),解説」の順で貼り付けてください。</p>
              <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
              <button className="btn primary mt" disabled={busy || !csvRows.length} onClick={() => act(() => api("/api/admin/questions/import", { body: { rows: csvRows } }))}>
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
                  <th>問題</th>
                  <th>正解</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {questions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      問題が登録されていません
                    </td>
                  </tr>
                )}
                {questions.map((q) => (
                  <tr key={q.id} className={q.active ? "" : "dim"}>
                    <td>{q.sort_order}</td>
                    <td className="nowrap">{q.category}</td>
                    <td>{q.question}</td>
                    <td className="small">{q.choices[q.correct_index]}</td>
                    <td className="nowrap">
                      <button className="btn sm" onClick={() => open(q)}>
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

      {tab === "results" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>受験日時</th>
                <th>検査員</th>
                <th className="right">得点</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.submitted_at).toLocaleString("ja-JP")}</td>
                  <td>{a.inspector?.name}</td>
                  <td className="right">
                    {a.score} / {a.total}
                  </td>
                  <td>{a.passed ? <span className="badge ok">合格</span> : <span className="badge ng">不合格</span>}</td>
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
            {error && <div className="alert error">{error}</div>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const payload = { ...form, choices: form.choices.filter((c) => c.trim()) };
                act(() =>
                  editing === "new" ? api("/api/admin/questions", { body: payload }) : api(`/api/admin/questions/${editing.id}`, { method: "PATCH", body: payload }),
                );
              }}
            >
              <div className="row">
                <label className="field" style={{ width: 90 }}>
                  <span>番号</span>
                  <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
                </label>
                <label className="field grow">
                  <span>カテゴリ</span>
                  <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span>問題文 *</span>
                <textarea value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} required />
              </label>
              <div className="field">
                <span className="muted small">選択肢（◉ が正解）</span>
                {form.choices.map((c, i) => (
                  <div className="row" key={i} style={{ marginTop: 6, flexWrap: "nowrap" }}>
                    <input type="radio" name="correct" checked={form.correct_index === i} onChange={() => setForm({ ...form, correct_index: i })} />
                    <input
                      type="text"
                      value={c}
                      placeholder={`選択肢 ${i + 1}`}
                      onChange={(e) => setForm({ ...form, choices: form.choices.map((x, j) => (j === i ? e.target.value : x)) })}
                    />
                  </div>
                ))}
                {form.choices.length < 6 && (
                  <button type="button" className="btn sm mt" onClick={() => setForm({ ...form, choices: [...form.choices, ""] })}>
                    ＋ 選択肢
                  </button>
                )}
              </div>
              <label className="field">
                <span>解説（採点後に表示）</span>
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
