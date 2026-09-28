"use client";

import Link from "next/link";
import { useMe } from "@/components/LiffProvider";

export default function LiffHome() {
  const { me } = useMe();
  return (
    <main className="liff">
      <h1 style={{ fontSize: 18 }}>{me.name} さん</h1>
      <div className="menu-grid">
        <Link href="/liff/schedule">
          <span className="icon">📅</span>マイスケジュール
        </Link>
        <Link href="/liff/expenses">
          <span className="icon">🚗</span>交通費申請
        </Link>
        <Link href="/liff/profile">
          <span className="icon">👤</span>基本情報の変更
        </Link>
        <Link href="/liff/test">
          <span className="icon">📝</span>50問テスト
        </Link>
      </div>
      <Link className="btn block mt" href="/liff/offers">
        📋 受注可否の回答
      </Link>
    </main>
  );
}
