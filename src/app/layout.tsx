import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "衛生検査スケジュール管理",
  description: "飲食店衛生検査の検査員・管理者向けスケジュール管理アプリ",
  // iPhone でホーム画面に追加したときの名前・表示（アイコンは app/apple-icon.png）
  appleWebApp: { capable: true, title: "衛生検査", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#16322b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
