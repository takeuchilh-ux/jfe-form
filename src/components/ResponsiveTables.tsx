"use client";

import { useEffect } from "react";

/**
 * スマホ表示で表をカード型に並べ替えるため、各セルに見出し（th の文字）を data-label として付ける。
 * 表の中身が変わったときも付け直す。
 */
export default function ResponsiveTables() {
  useEffect(() => {
    const label = () => {
      document.querySelectorAll<HTMLTableElement>(".admin-main table").forEach((table) => {
        const heads = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent?.trim() ?? "");
        table.querySelectorAll("tbody tr").forEach((tr) => {
          Array.from(tr.children).forEach((td, i) => {
            const text = heads[i] ?? "";
            if (td.getAttribute("data-label") !== text) td.setAttribute("data-label", text);
          });
        });
      });
    };
    label();
    const main = document.querySelector(".admin-main");
    if (!main) return;
    const obs = new MutationObserver(label);
    obs.observe(main, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
