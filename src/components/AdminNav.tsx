"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";

type BadgeKey = "expenses" | "tests" | "inspectors" | "assign";
type Badges = Record<BadgeKey, number>;
type Item = { href: string; label: string; short: string; icon: string; badge?: BadgeKey };

/** 自動更新の間隔 */
const REFRESH_MS = 30_000;

const LINKS: Item[] = [
  { href: "/admin", label: "ダッシュボード", short: "ホーム", icon: "🏠" },
  { href: "/admin/schedules", label: "検査スケジュール", short: "予定", icon: "🗓" },
  { href: "/admin/assign", label: "アサイン", short: "アサイン", icon: "👥", badge: "assign" },
  { href: "/admin/expenses", label: "交通費", short: "交通費", icon: "🚗", badge: "expenses" },
  { href: "/admin/tests", label: "50問テスト", short: "テスト", icon: "📝", badge: "tests" },
  { href: "/admin/inspectors", label: "検査員", short: "検査員", icon: "🧑‍🔬", badge: "inspectors" },
  { href: "/admin/stores", label: "店舗", short: "店舗", icon: "🏪" },
  { href: "/admin/orders", label: "備品の発注", short: "発注", icon: "📦" },
  { href: "/admin/settings", label: "設定", short: "設定", icon: "⚙️" },
];

/** スマホ下部のタブに並べる項目（残りは「その他」に入れる） */
const BOTTOM = LINKS.slice(0, 4);
const MORE = LINKS.slice(4);

export default function AdminNav({ name }: { name: string }) {
  const path = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [badges, setBadges] = useState<Badges | null>(null);
  const last = useRef<string>("");

  /** 件数を取得し、変化があれば画面のデータも更新する。入力中・ダイアログ表示中は画面の更新だけ見送る */
  const tick = useCallback(
    async (refreshPage: boolean) => {
      if (document.visibilityState !== "visible") return;
      try {
        const b = await api<Badges>("/api/admin/badges");
        setBadges(b);
        const key = JSON.stringify(b);
        const changed = last.current !== "" && last.current !== key;
        last.current = key;
        const el = document.activeElement;
        const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
        const dialogOpen = !!document.querySelector(".modal-back");
        if ((refreshPage || changed) && !typing && !dialogOpen) router.refresh();
      } catch {
        // 通信エラー時は次回に再試行
      }
    },
    [router],
  );

  useEffect(() => {
    tick(false);
    const t = setInterval(() => tick(true), REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && tick(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [tick]);

  // ページ移動や、画面での操作（承認など）の後にも件数を取り直す
  useEffect(() => {
    tick(false);
  }, [path, tick]);
  useEffect(() => {
    const onChanged = () => setTimeout(() => tick(false), 300);
    window.addEventListener("kensa:changed", onChanged);
    return () => window.removeEventListener("kensa:changed", onChanged);
  }, [tick]);

  const total = badges ? badges.expenses + badges.tests + badges.inspectors : 0;
  useEffect(() => {
    document.title = total ? `(${total}) 衛生検査管理` : "衛生検査管理";
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    (total ? nav.setAppBadge?.(total) : nav.clearAppBadge?.())?.catch(() => {});
  }, [total]);

  const n = (l: Item) => (l.badge && badges ? badges[l.badge] : 0);
  const moreCount = badges ? MORE.reduce((s, l) => s + n(l), 0) : 0;
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
            <Badge n={n(l)} />
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
            <span className="ic">
              {l.icon}
              <Badge n={n(l)} />
            </span>
            <span>{l.short}</span>
          </Link>
        ))}
        <button className={moreActive || moreOpen ? "active" : ""} onClick={() => setMoreOpen((v) => !v)}>
          <span className="ic">
            ☰<Badge n={moreCount} />
          </span>
          <span>その他</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-back" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grid">
              {MORE.map((l) => (
                <Link key={l.href} href={l.href} className={isActive(l.href) ? "active" : ""}>
                  <span className="ic">
                    {l.icon}
                    <Badge n={n(l)} />
                  </span>
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

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return <span className="nav-badge">{n > 99 ? "99+" : n}</span>;
}
