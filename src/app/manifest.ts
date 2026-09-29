import type { MetadataRoute } from "next";

/** ホーム画面に追加したときのアプリ情報（Android など） */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "衛生検査管理",
    short_name: "衛生検査",
    description: "飲食店衛生検査の検査員・管理者向けスケジュール管理アプリ",
    start_url: "/admin",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#16322b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
