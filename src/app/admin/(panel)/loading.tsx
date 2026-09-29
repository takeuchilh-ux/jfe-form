/** 管理画面のページ切り替え中にすぐ表示する読み込み表示 */
export default function Loading() {
  return (
    <div className="loading-screen" aria-busy="true">
      <div className="spinner" />
      <span className="muted">読み込み中…</span>
    </div>
  );
}
