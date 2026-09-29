"use client";

import { downloadCsv, readCsvFile } from "@/lib/client";

/** CSV 一括登録欄の上に置く「雛形ダウンロード」「ファイルから読み込み」 */
export default function CsvTools({
  filename,
  template,
  onLoad,
}: {
  filename: string;
  template: (string | number)[][];
  onLoad: (text: string) => void;
}) {
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <button type="button" className="btn sm" onClick={() => downloadCsv(filename, template)}>
        📄 雛形をダウンロード
      </button>
      <label className="btn sm" style={{ cursor: "pointer" }}>
        📂 CSV ファイルを選択
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onLoad(await readCsvFile(f));
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
