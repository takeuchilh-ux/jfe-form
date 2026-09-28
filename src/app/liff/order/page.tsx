"use client";

import LiffHeader from "@/components/LiffHeader";
import { useMe } from "@/components/LiffProvider";

/** 発注（検査員向け）：内容は後日決定のため準備中 */
export default function OrderPage() {
  const { me } = useMe();
  return (
    <main className="liff">
      <LiffHeader title="発注" />
      {me.kind !== "inspector" ? (
        <div className="alert warn">この機能は検査員向けです。</div>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "40px 16px" }}>
          <div style={{ fontSize: 40 }}>📦</div>
          <p className="mt">
            <strong>発注機能は準備中です</strong>
          </p>
          <p className="muted small">公開まで今しばらくお待ちください。</p>
        </div>
      )}
    </main>
  );
}
