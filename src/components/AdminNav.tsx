"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client";

const LINKS = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/schedules", label: "検査スケジュール" },
  { href: "/admin/assign", label: "アサイン" },
  { href: "/admin/expenses", label: "交通費" },
  { href: "/admin/tests", label: "50問テスト" },
  { href: "/admin/inspectors", label: "検査員" },
  { href: "/admin/stores", label: "店舗" },
  { href: "/admin/settings", label: "設定" },
];

export default function AdminNav({ name }: { name: string }) {
  const path = usePathname();
  async function logout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    location.href = "/admin/login";
  }
  return (
    <nav className="admin-nav">
      <div className="brand">🧪 衛生検査管理</div>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={(l.href === "/admin" ? path === l.href : path.startsWith(l.href)) ? "active" : ""}>
          {l.label}
        </Link>
      ))}
      <div className="who">
        {name}
        <br />
        <button className="btn sm" style={{ marginTop: 8 }} onClick={logout}>
          ログアウト
        </button>
      </div>
    </nav>
  );
}
