"use client";

import { useEffect, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import { api, errMsg } from "@/lib/client";

type Q = { id: string; category: string; question: string };
type Exam = { attemptId: string; passScore: number; remaining: number; questions: Q[] };
type Feedback = { answer: number; correct: number; isCorrect: boolean; explanation: string };
type Result = {
  score: number;
  total: number;
  passed: boolean;
  wrong: { id: string; question: string; correct: number; answer: number | null; explanation: string }[];
};
type History = {
  attempts: { id: string; score: number; total: number; passed: boolean; submitted_at: string }[];
  usedToday: number;
  dailyLimit: number;
};

const MARK = ["○", "×"];

export default function TestPage() {
  const { me } = useMe();
  const [history, setHistory] = useState<History | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [idx, setIdx] = useState(0);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<History>("/api/liff/test/history")
      .then(setHistory)
      .catch((e) => setError(errMsg(e)));
  }, [result]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      setExam(await api<Exam>("/api/liff/test", { method: "POST" }));
      setFeedback({});
      setIdx(0);
      setResult(null);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function answer(a: 0 | 1) {
    if (!exam || busy) return;
    const q = exam.questions[idx];
    if (feedback[q.id]) return;
    setBusy(true);
    setError("");
    try {
      const f = await api<Feedback>("/api/liff/test/answer", { body: { attemptId: exam.attemptId, questionId: q.id, answer: a } });
      setFeedback((m) => ({ ...m, [q.id]: f }));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!exam) return;
    const left = exam.questions.length - Object.keys(feedback).length;
    if (left > 0 && !confirm(`未回答が ${left} 問あります（不正解になります）。提出しますか？`)) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api<Result>("/api/liff/test", { method: "PUT", body: { attemptId: exam.attemptId } }));
      setExam(null);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  // ── 採点結果 ──
  if (result) {
    return (
      <main className="liff">
        <LiffHeader title="採点結果" />
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, fontWeight: 700 }}>
            {result.score} <span style={{ fontSize: 20 }}>/ {result.total}</span>
          </div>
          <div style={{ fontSize: 20, marginTop: 4 }}>
            {result.passed ? <span className="badge ok">🎉 合格</span> : <span className="badge ng">不合格</span>}
          </div>
          <p className="muted small mt">合格ライン：{me.testPassScore} 問以上正解</p>
        </div>
        {result.wrong.length > 0 && <h2 className="mt">間違えた問題（{result.wrong.length}）</h2>}
        {result.wrong.map((w) => (
          <div className="card" key={w.id}>
            <p>{w.question}</p>
            <p className="small">
              正解：<strong>{MARK[w.correct]}</strong>　あなたの回答：{w.answer === null ? "未回答" : MARK[w.answer]}
            </p>
            {w.explanation && <p className="small muted">💡 {w.explanation}</p>}
          </div>
        ))}
        <button className="btn block" onClick={() => setResult(null)}>
          テストのトップへ
        </button>
      </main>
    );
  }

  // ── 受験中 ──
  if (exam) {
    const q = exam.questions[idx];
    const f = feedback[q.id];
    const answered = Object.keys(feedback).length;
    const correctSoFar = Object.values(feedback).filter((x) => x.isCorrect).length;
    const last = idx === exam.questions.length - 1;
    return (
      <main className="liff">
        <div className="row between" style={{ marginBottom: 8 }}>
          <strong>
            第 {idx + 1} 問 / {exam.questions.length}
          </strong>
          <span className="muted small">
            正解 {correctSoFar} / 回答 {answered}
          </span>
        </div>
        <div className="progress" style={{ marginBottom: 16 }}>
          <div style={{ width: `${(answered / exam.questions.length) * 100}%` }} />
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="card">
          {q.category && <span className="badge">{q.category}</span>}
          <p style={{ fontSize: 17, marginTop: 10, lineHeight: 1.7 }}>{q.question}</p>
          <div className="tf-buttons">
            {[0, 1].map((a) => (
              <button
                key={a}
                className={`tf-btn ${f ? (a === f.correct ? "is-correct" : a === f.answer ? "is-wrong" : "is-dim") : ""}`}
                disabled={!!f || busy}
                onClick={() => answer(a as 0 | 1)}
                aria-label={a === 0 ? "まる（正しい）" : "ばつ（誤り）"}
              >
                {MARK[a]}
              </button>
            ))}
          </div>
          {f && (
            <div className={`alert ${f.isCorrect ? "success" : "error"} mt`}>
              <strong>{f.isCorrect ? "⭕ 正解！" : `❌ 不正解（正解は「${MARK[f.correct]}」）`}</strong>
              {!f.isCorrect && f.explanation && <div className="small" style={{ marginTop: 4, color: "var(--text)" }}>💡 {f.explanation}</div>}
            </div>
          )}
        </div>
        {f && !last && (
          <button className="btn primary block lg" onClick={() => setIdx(idx + 1)}>
            次の問題へ ›
          </button>
        )}
        {(last && f) || answered === exam.questions.length ? (
          <button className="btn primary block lg mt" disabled={busy} onClick={submit}>
            採点する
          </button>
        ) : null}
        {idx > 0 && (
          <button className="btn block mt" onClick={() => setIdx(idx - 1)}>
            ‹ 前の問題を見る
          </button>
        )}
      </main>
    );
  }

  // ── トップ ──
  const remaining = history ? Math.max(0, history.dailyLimit - history.usedToday) : null;
  return (
    <main className="liff">
      <LiffHeader title="50問テスト" />
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        <p>
          衛生巡回の手順についての<strong>○×テスト</strong>です。全 {me.testQuestionCount} 問、{me.testPassScore} 問以上の正解で合格です。
        </p>
        <p className="muted small">・問題と順番は毎回ランダムに変わります</p>
        <p className="muted small">・回答するとすぐに正解が表示されます（回答のやり直しはできません）</p>
        <p className="muted small">・受験は 1 日 {me.testDailyLimit} 回までです（途中でやめた回も 1 回に数えます）</p>
        {remaining !== null && (
          <p className="mt">
            本日の残り受験回数：<strong>{remaining}</strong> 回
          </p>
        )}
        <button className="btn primary block lg mt" disabled={busy || remaining === 0} onClick={start}>
          {remaining === 0 ? "本日の受験回数に達しました" : "テストを始める"}
        </button>
      </div>
      <h2 className="mt">受験履歴</h2>
      {!history && <p className="muted">読み込み中…</p>}
      {history?.attempts.length === 0 && <p className="muted">まだ受験していません。</p>}
      {history?.attempts.map((h) => (
        <div className="card row between" key={h.id}>
          <span>{new Date(h.submitted_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span>
            {h.score} / {h.total}
          </span>
          {h.passed ? <span className="badge ok">合格</span> : <span className="badge ng">不合格</span>}
        </div>
      ))}
    </main>
  );
}
