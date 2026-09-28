"use client";

import { useCallback, useEffect, useState } from "react";
import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";
import { api, errMsg } from "@/lib/client";
import { fmtDate, todayJst } from "@/lib/format";

const MARK = ["○", "×"];

type Status = {
  request: { id: string; exam_date: string; status: "pending" | "approved"; admin_comment: string } | null;
  canStart: boolean;
  inProgress: boolean;
  lastRejected: { exam_date: string; admin_comment: string } | null;
  history: { id: string; score: number; total: number; passed: boolean; submitted_at: string }[];
};

export default function TestPage() {
  const { me } = useMe();
  const [mode, setMode] = useState<"top" | "practice" | "exam">("top");
  if (me.kind !== "trainee") {
    return (
      <main className="liff">
        <LiffHeader title="50問テスト" />
        <div className="alert warn">50問テストは研修生向けの機能です。</div>
      </main>
    );
  }
  if (mode === "practice") return <Practice onExit={() => setMode("top")} />;
  if (mode === "exam") return <Exam onExit={() => setMode("top")} />;
  return <Top onPractice={() => setMode("practice")} onExam={() => setMode("exam")} />;
}

/* ─────────────── トップ：練習／本番の選択 ─────────────── */
function Top({ onPractice, onExam }: { onPractice: () => void; onExam: () => void }) {
  const { me } = useMe();
  const [status, setStatus] = useState<Status | null>(null);
  const [date, setDate] = useState(todayJst());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Status>("/api/liff/test")
      .then(setStatus)
      .catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const r = status?.request;
  return (
    <main className="liff">
      <LiffHeader title="50問テスト" />
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>📘 練習用</h2>
        <p className="small muted">
          何回でも受験できます。1 問ごとに正解と解説が表示されます（結果は記録されません）。
        </p>
        <button className="btn block lg mt" onClick={onPractice}>
          練習を始める
        </button>
      </div>

      <div className="card">
        <h2>📝 本番用</h2>
        <p className="small muted">
          受験日を決めて申請し、管理者が承認すると、その日に受験できます。全 {me.testQuestionCount} 問、{me.testPassScore} 問以上の正解で合格です。
        </p>
        {!status ? (
          <p className="muted">読み込み中…</p>
        ) : r?.status === "pending" ? (
          <>
            <div className="alert warn mt">
              受験日 <strong>{fmtDate(r.exam_date)}</strong> で申請中です。管理者の承認をお待ちください。
            </div>
            <button className="btn block" disabled={busy} onClick={() => confirm("申請を取り下げますか？") && run(() => api("/api/liff/test/request", { method: "DELETE" }))}>
              申請を取り下げる
            </button>
          </>
        ) : r?.status === "approved" ? (
          status.canStart ? (
            <>
              <div className="alert success mt">本日が受験日です。準備ができたら始めてください。</div>
              <button className="btn primary block lg" onClick={onExam}>
                {status.inProgress ? "本番テストを再開する" : "本番テストを始める"}
              </button>
            </>
          ) : (
            <>
              <div className="alert success mt">
                承認されました。受験日 <strong>{fmtDate(r.exam_date)}</strong> に受験できます。
              </div>
              <button className="btn block" disabled={busy} onClick={() => confirm("申請を取り下げますか？") && run(() => api("/api/liff/test/request", { method: "DELETE" }))}>
                申請を取り下げる
              </button>
            </>
          )
        ) : (
          <>
            {status.lastRejected && (
              <div className="alert warn mt small">
                前回の申請（{fmtDate(status.lastRejected.exam_date)}）は承認されませんでした。
                {status.lastRejected.admin_comment && <> 理由：{status.lastRejected.admin_comment}</>}
              </div>
            )}
            <label className="field mt">
              <span>受験希望日</span>
              <input type="date" min={todayJst()} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button className="btn primary block lg" disabled={busy || !date} onClick={() => run(() => api("/api/liff/test/request", { body: { exam_date: date } }))}>
              本番テストを申請する
            </button>
          </>
        )}
      </div>

      <h2 className="mt">本番の受験結果</h2>
      {status?.history.length === 0 && <p className="muted">まだ受験していません。</p>}
      {status?.history.map((h) => (
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

/* ─────────────── 練習用：1 問ごとに正誤と解説 ─────────────── */
type PQ = { id: string; category: string; question: string; correct: number; explanation: string };

function Practice({ onExit }: { onExit: () => void }) {
  const { me } = useMe();
  const [qs, setQs] = useState<PQ[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setQs(null);
    setIdx(0);
    setAnswers({});
    setDone(false);
    api<{ questions: PQ[] }>("/api/liff/test/practice")
      .then((r) => setQs(r.questions))
      .catch((e) => setError(errMsg(e)));
  }, []);
  useEffect(load, [load]);

  if (error) return <Shell title="練習用" onExit={onExit}><div className="alert error">{error}</div></Shell>;
  if (!qs) return <Shell title="練習用" onExit={onExit}><p className="muted">問題を準備しています…</p></Shell>;

  const score = qs.filter((q) => answers[q.id] === q.correct).length;
  if (done) {
    const wrong = qs.filter((q) => answers[q.id] !== q.correct);
    return (
      <Shell title="練習の結果" onExit={onExit}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, fontWeight: 700 }}>
            {score} <span style={{ fontSize: 20 }}>/ {qs.length}</span>
          </div>
          <div className="muted small">本番の合格ラインは {me.testPassScore} 問です（練習の結果は記録されません）</div>
        </div>
        {wrong.length > 0 && <h2 className="mt">間違えた問題（{wrong.length}）</h2>}
        {wrong.map((q) => (
          <div className="card" key={q.id}>
            <p>{q.question}</p>
            <p className="small">
              正解：<strong>{MARK[q.correct]}</strong>　あなたの回答：{answers[q.id] === undefined ? "未回答" : MARK[answers[q.id]]}
            </p>
            {q.explanation && <p className="small muted">💡 {q.explanation}</p>}
          </div>
        ))}
        <button className="btn primary block lg" onClick={load}>
          もう一度練習する
        </button>
        <button className="btn block mt" onClick={onExit}>
          テストのトップへ
        </button>
      </Shell>
    );
  }

  const q = qs[idx];
  const a = answers[q.id];
  const answered = Object.keys(answers).length;
  const last = idx === qs.length - 1;
  return (
    <main className="liff">
      <ProgressHead title="練習" idx={idx} total={qs.length} answered={answered} extra={`正解 ${score}`} onExit={onExit} />
      <div className="card">
        {q.category && <span className="badge">{q.category}</span>}
        <p className="q-text">{q.question}</p>
        <div className="tf-buttons">
          {[0, 1].map((i) => (
            <button
              key={i}
              className={`tf-btn ${a === undefined ? "" : i === q.correct ? "is-correct" : i === a ? "is-wrong" : "is-dim"}`}
              disabled={a !== undefined}
              onClick={() => setAnswers({ ...answers, [q.id]: i })}
            >
              {MARK[i]}
            </button>
          ))}
        </div>
        {a !== undefined && (
          <div className={`alert ${a === q.correct ? "success" : "error"} mt`}>
            <strong>{a === q.correct ? "⭕ 正解！" : `❌ 不正解（正解は「${MARK[q.correct]}」）`}</strong>
            {q.explanation && <div className="small" style={{ marginTop: 4, color: "var(--text)" }}>💡 {q.explanation}</div>}
          </div>
        )}
      </div>
      {a !== undefined &&
        (last ? (
          <button className="btn primary block lg" onClick={() => setDone(true)}>
            結果を見る
          </button>
        ) : (
          <button className="btn primary block lg" onClick={() => setIdx(idx + 1)}>
            次の問題へ ›
          </button>
        ))}
      {idx > 0 && (
        <button className="btn block mt" onClick={() => setIdx(idx - 1)}>
          ‹ 前の問題を見る
        </button>
      )}
    </main>
  );
}

/* ─────────────── 本番用：解説なし・提出まで何度でも修正可 ─────────────── */
type EQ = { id: string; category: string; question: string };
type ExamData = { attemptId: string; passScore: number; answers: Record<string, number>; questions: EQ[] };
type ExamResult = { score: number; total: number; passed: boolean; wrong: { id: string; no: number; question: string; correct: number; answer: number | null }[] };

function Exam({ onExit }: { onExit: () => void }) {
  const [exam, setExam] = useState<ExamData | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [idx, setIdx] = useState(0);
  const [review, setReview] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ExamData>("/api/liff/test", { method: "POST" })
      .then((e) => {
        setExam(e);
        setAnswers(e.answers);
        // 再開時は最初の未回答の問題から
        const first = e.questions.findIndex((q) => e.answers[q.id] === undefined);
        setIdx(first < 0 ? 0 : first);
        if (first < 0) setReview(true);
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  async function choose(a: number) {
    if (!exam) return;
    const q = exam.questions[idx];
    const prev = answers[q.id];
    setAnswers({ ...answers, [q.id]: a });
    setError("");
    try {
      await api("/api/liff/test/answer", { body: { attemptId: exam.attemptId, questionId: q.id, answer: a } });
      // 未回答の問題に答えたときだけ自動で次へ（見直し中の修正では移動しない）
      if (prev === undefined && idx < exam.questions.length - 1) setTimeout(() => setIdx((n) => Math.min(n + 1, exam.questions.length - 1)), 250);
      if (prev === undefined && idx === exam.questions.length - 1) setReview(true);
    } catch (e) {
      setAnswers((m) => {
        const next = { ...m };
        if (prev === undefined) delete next[q.id];
        else next[q.id] = prev;
        return next;
      });
      setError(`回答を保存できませんでした：${errMsg(e)}`);
    }
  }

  async function submit() {
    if (!exam) return;
    const left = exam.questions.length - Object.keys(answers).length;
    if (!confirm(left ? `未回答が ${left} 問あります（不正解になります）。提出しますか？提出後は修正できません。` : "提出します。提出後は修正できません。よろしいですか？")) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api<ExamResult>("/api/liff/test", { method: "PUT", body: { attemptId: exam.attemptId } }));
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Shell title="本番テストの結果" onExit={onExit}>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, fontWeight: 700 }}>
            {result.score} <span style={{ fontSize: 20 }}>/ {result.total}</span>
          </div>
          <div style={{ fontSize: 20, marginTop: 4 }}>
            {result.passed ? <span className="badge ok">🎉 合格</span> : <span className="badge ng">不合格</span>}
          </div>
        </div>
        {result.wrong.length > 0 && <h2 className="mt">間違えた問題（{result.wrong.length}）</h2>}
        {result.wrong.map((w) => (
          <div className="card" key={w.id}>
            <div className="muted small">第 {w.no} 問</div>
            <p>{w.question}</p>
            <p className="small">
              正解：<strong>{MARK[w.correct]}</strong>　あなたの回答：{w.answer === null ? "未回答" : MARK[w.answer]}
            </p>
          </div>
        ))}
        <button className="btn block" onClick={onExit}>
          テストのトップへ
        </button>
      </Shell>
    );
  }
  if (!exam) return <Shell title="本番テスト" onExit={onExit}>{error ? <div className="alert error">{error}</div> : <p className="muted">準備しています…</p>}</Shell>;

  const answered = Object.keys(answers).length;

  // 見直し（一覧）画面
  if (review) {
    return (
      <main className="liff">
        <ProgressHead title="本番" idx={-1} total={exam.questions.length} answered={answered} onExit={onExit} />
        {error && <div className="alert error">{error}</div>}
        <div className="card">
          <h3>見直し</h3>
          <p className="small muted">番号を押すとその問題に戻って回答を修正できます。提出するまでは何度でも修正できます。</p>
          <div className="review-grid">
            {exam.questions.map((q, i) => (
              <button key={q.id} className={`review-cell ${answers[q.id] === undefined ? "empty" : ""}`} onClick={() => (setIdx(i), setReview(false))}>
                <span className="no">{i + 1}</span>
                <span className="mk">{answers[q.id] === undefined ? "−" : MARK[answers[q.id]]}</span>
              </button>
            ))}
          </div>
        </div>
        <button className="btn primary block lg" disabled={busy} onClick={submit}>
          {busy ? "採点中…" : answered < exam.questions.length ? `提出する（未回答 ${exam.questions.length - answered} 問）` : "提出する"}
        </button>
      </main>
    );
  }

  const q = exam.questions[idx];
  const a = answers[q.id];
  return (
    <main className="liff">
      <ProgressHead title="本番" idx={idx} total={exam.questions.length} answered={answered} onExit={onExit} />
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        {q.category && <span className="badge">{q.category}</span>}
        <p className="q-text">{q.question}</p>
        <div className="tf-buttons">
          {[0, 1].map((i) => (
            <button key={i} className={`tf-btn ${a === i ? "is-selected" : ""}`} onClick={() => choose(i)}>
              {MARK[i]}
            </button>
          ))}
        </div>
        {a !== undefined && <p className="small muted mt" style={{ textAlign: "center" }}>回答：{MARK[a]}（押し直すと変更できます）</p>}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button className="btn grow" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          ‹ 前へ
        </button>
        {idx < exam.questions.length - 1 ? (
          <button className="btn grow" onClick={() => setIdx(idx + 1)}>
            次へ ›
          </button>
        ) : (
          <button className="btn grow" onClick={() => setReview(true)}>
            見直しへ ›
          </button>
        )}
      </div>
      <button className="btn block mt" onClick={() => setReview(true)}>
        📋 見直し・提出（回答済み {answered} / {exam.questions.length}）
      </button>
    </main>
  );
}

/* ─────────────── 共通 ─────────────── */
function Shell({ title, onExit, children }: { title: string; onExit: () => void; children: React.ReactNode }) {
  return (
    <main className="liff">
      <div className="liff-header">
        <button className="btn sm" onClick={onExit}>
          ‹ 戻る
        </button>
        <h1>{title}</h1>
      </div>
      {children}
    </main>
  );
}

function ProgressHead({ title, idx, total, answered, extra, onExit }: { title: string; idx: number; total: number; answered: number; extra?: string; onExit: () => void }) {
  return (
    <>
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="btn sm" onClick={() => confirm(title === "本番" ? "トップに戻りますか？（回答は保存されており、今日中なら再開できます）" : "練習を終了しますか？") && onExit()}>
          ✕
        </button>
        <strong>{idx >= 0 ? `${title}　第 ${idx + 1} 問 / ${total}` : `${title}　見直し`}</strong>
        <span className="muted small">
          {extra ? `${extra}・` : ""}回答 {answered}
        </span>
      </div>
      <div className="progress" style={{ marginBottom: 16 }}>
        <div style={{ width: `${(answered / total) * 100}%` }} />
      </div>
    </>
  );
}
