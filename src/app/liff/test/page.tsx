"use client";

import { useEffect, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import { api, errMsg } from "@/lib/client";

type Q = { id: string; category: string; question: string; choices: string[] };
type Exam = { attemptId: string; passScore: number; questions: Q[] };
type Result = {
  score: number;
  total: number;
  passed: boolean;
  results: { id: string; question: string; choices: string[]; correct: number; answer: number | null; explanation: string }[];
};
type History = { id: string; score: number; total: number; passed: boolean; submitted_at: string }[];

export default function TestPage() {
  const { me } = useMe();
  const [history, setHistory] = useState<History | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ attempts: History }>("/api/liff/test/history")
      .then((r) => setHistory(r.attempts))
      .catch((e) => setError(errMsg(e)));
  }, [result]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      const e = await api<Exam>("/api/liff/test", { method: "POST" });
      setExam(e);
      setAnswers({});
      setIdx(0);
      setResult(null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!exam) return;
    const left = exam.questions.length - Object.keys(answers).length;
    if (!confirm(left ? `未回答が ${left} 問あります。提出しますか？` : "提出して採点します。よろしいですか？")) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api<Result>("/api/liff/test", { method: "PUT", body: { attemptId: exam.attemptId, answers } }));
      setExam(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const wrong = result.results.filter((r) => r.answer !== r.correct);
    return (
      <main className="liff">
        <LiffHeader title="採点結果" />
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 700 }}>
            {result.score} <span style={{ fontSize: 20 }}>/ {result.total}</span>
          </div>
          <div style={{ fontSize: 20 }}>{result.passed ? <span className="badge ok">🎉 合格</span> : <span className="badge ng">不合格</span>}</div>
        </div>
        {wrong.length > 0 && <h2 className="mt">間違えた問題（{wrong.length}）</h2>}
        {wrong.map((r) => (
          <div className="card" key={r.id}>
            <p style={{ whiteSpace: "pre-wrap" }}>{r.question}</p>
            {r.choices.map((c, i) => (
              <div key={i} className={`q-choice ${i === r.correct ? "correct" : i === r.answer ? "wrong" : ""}`}>
                {i === r.correct ? "○" : i === r.answer ? "×" : "・"} {c}
              </div>
            ))}
            {r.answer === null && <p className="small muted mt">未回答</p>}
            {r.explanation && <p className="small mt">💡 {r.explanation}</p>}
          </div>
        ))}
        <button className="btn block" onClick={() => setResult(null)}>
          テストのトップへ
        </button>
      </main>
    );
  }

  if (exam) {
    const q = exam.questions[idx];
    const answered = Object.keys(answers).length;
    const last = idx === exam.questions.length - 1;
    return (
      <main className="liff">
        <div className="row between" style={{ marginBottom: 8 }}>
          <strong>
            第 {idx + 1} 問 / {exam.questions.length}
          </strong>
          <span className="muted small">回答済 {answered}</span>
        </div>
        <div className="progress" style={{ marginBottom: 16 }}>
          <div style={{ width: `${(answered / exam.questions.length) * 100}%` }} />
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="card">
          {q.category && <span className="badge">{q.category}</span>}
          <p style={{ whiteSpace: "pre-wrap", fontSize: 16, marginTop: 8 }}>{q.question}</p>
          {q.choices.map((c, i) => (
            <div
              key={i}
              className={`q-choice ${answers[q.id] === i ? "on" : ""}`}
              onClick={() => {
                setAnswers((a) => ({ ...a, [q.id]: i }));
                if (!last) setTimeout(() => setIdx((n) => Math.min(n + 1, exam.questions.length - 1)), 200);
              }}
            >
              <strong>{i + 1}.</strong> {c}
            </div>
          ))}
        </div>
        <div className="row">
          <button className="btn grow" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
            ‹ 前へ
          </button>
          {!last && (
            <button className="btn grow" onClick={() => setIdx(idx + 1)}>
              次へ ›
            </button>
          )}
        </div>
        <details className="mt">
          <summary className="muted small">問題一覧から移動</summary>
          <div className="chips mt">
            {exam.questions.map((x, i) => (
              <span key={x.id} className={`chip ${x.id in answers ? "on" : ""}`} onClick={() => setIdx(i)} style={{ minWidth: 36, justifyContent: "center" }}>
                {i + 1}
              </span>
            ))}
          </div>
        </details>
        <div className="sticky-foot">
          <button className="btn primary block lg" disabled={busy} onClick={submit}>
            提出して採点する
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="liff">
      <LiffHeader title="50問テスト" />
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        <p>
          衛生検査の知識確認テストです。全 {me.testQuestionCount} 問、{me.testPassScore} 問以上の正解で合格です。
        </p>
        <p className="muted small">途中で画面を閉じると回答は保存されません。</p>
        <button className="btn primary block lg mt" disabled={busy} onClick={start}>
          テストを始める
        </button>
      </div>
      <h2 className="mt">受験履歴</h2>
      {!history && <p className="muted">読み込み中…</p>}
      {history?.length === 0 && <p className="muted">まだ受験していません。</p>}
      {history?.map((h) => (
        <div className="card row between" key={h.id}>
          <span>{new Date(h.submitted_at).toLocaleDateString("ja-JP")}</span>
          <span>
            {h.score} / {h.total}
          </span>
          {h.passed ? <span className="badge ok">合格</span> : <span className="badge ng">不合格</span>}
        </div>
      ))}
    </main>
  );
}
