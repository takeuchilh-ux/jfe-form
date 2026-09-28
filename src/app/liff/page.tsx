"use client";

import Link from "next/link";
import { useMe } from "@/components/LiffProvider";
import { KIND_LABEL } from "@/lib/format";

/** 区分ごとのメニュー（リッチメニューと同じ並び） */
const MENU = {
  inspector: [
    { href: "/liff/schedule", icon: "📅", label: "マイスケジュール" },
    { href: "/liff/expenses", icon: "🚗", label: "交通費申請" },
    { href: "/liff/profile", icon: "👤", label: "基本情報の変更" },
    { href: "/liff/order", icon: "📦", label: "発注" },
  ],
  trainee: [
    { href: "/liff/schedule", icon: "📅", label: "マイスケジュール" },
    { href: "/liff/expenses", icon: "🚗", label: "交通費申請" },
    { href: "/liff/profile", icon: "👤", label: "基本情報の変更" },
    { href: "/liff/test", icon: "📝", label: "50問テスト" },
  ],
};

export default function LiffHome() {
  const { me } = useMe();
  return (
    <main className="liff">
      <h1 style={{ fontSize: 18 }}>
        {me.name} さん <span className="badge">{KIND_LABEL[me.kind]}</span>
      </h1>
      <div className="menu-grid">
        {MENU[me.kind].map((m) => (
          <Link key={m.href} href={m.href}>
            <span className="icon">{m.icon}</span>
            {m.label}
          </Link>
        ))}
      </div>
      <Link className="btn block mt" href="/liff/offers">
        📋 受注可否の回答
      </Link>
    </main>
  );
}
