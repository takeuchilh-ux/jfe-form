"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client";

type Item = { href: string; label: string; short: string; icon: string };

const LINKS: Item[] = [
  { href: "/admin", label: "ダッシュボード", short: "ホーム", icon: "🏠" },
  { href: "/admin/schedules", label: "検査スケジュール", short: "予定", icon: "🗓" },
  { href: "/admin/assign", label: "アサイン", short: "アサイン", icon: "👥" },
  { href: "/admin/expenses", label: "交通費", short: "交通費", icon: "🚗" },
  { href: "/admin/tests", label: "50問テスト", short: "テスト", icon: "📝" },
  { href: "/admin/inspectors", label: "検査員", short: "検査員", icon: "🧑‍🔬" },
  { href: "/admin/stores", label: "店舗", short: "店舗", icon: "🏪" },
  { href: "/admin/settings", label: "設定", short: "設定", icon: "⚙️" },
];

/** スマホ下部のタブに並べる項目（残りは「その他」に入れる） */
const BOTTOM = LINKS.slice(0, 4);
const MORE = LINKS.slice(4);

export default function AdminNav({ name }: { name: string }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (href: string) => (href === "/admin" ? path === href : path.startsWith(href));
  const moreActive = MORE.some((l) => isActive(l.href));

  // ページを移動したら「その他」を閉じる
  useEffect(() => setMoreOpen(false), [path]);

  async function logout() {
    await api("/api/admin/logout", { method: "POST" }).catch(() => {});
    location.href = "/admin/login";
  }

  return (
    <>
      {/* PC：左のサイドメニュー */}
      <nav className="admin-nav">
        <div className="brand">🧪 衛生検査管理</div>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
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

      {/* スマホ：画面下部のタブ */}
      <nav className="admin-tabbar" aria-label="メニュー">
        {BOTTOM.map((l) => (
          <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
            <span className="ic">{l.icon}</span>
            <span>{l.short}</span>
          </Link>
        ))}
        <button className={moreActive || moreOpen ? "active" : ""} onClick={() => setMoreOpen((v) => !v)}>
          <span className="ic">☰</span>
          <span>その他</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-back" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grid">
              {MORE.map((l) => (
                <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
                  <span className="ic">{l.icon}</span>
                  <span>{l.label}</span>
                </Link>
              ))}
            </div>
            <div className="row between mt">
              <span className="muted small">{name}</span>
              <button className="btn sm" onClick={logout}>
                ログアウト
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
