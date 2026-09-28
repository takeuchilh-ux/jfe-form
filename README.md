# 衛生検査スケジュール管理（LINE 版）

飲食店の衛生検査を行う **検査員（公式 LINE）** と **管理者（Web 管理画面）** のためのアプリです。
Next.js（Vercel）＋ Supabase ＋ LINE（Messaging API / LIFF）で動きます。

## できること

### 検査員（公式 LINE のリッチメニューから）
| メニュー | 内容 |
|---|---|
| 📋 受注可否の回答 | 管理者がリリースした月間スケジュールに「可／不可」で回答（期限まで何度でも変更可） |
| 📅 マイスケジュール | 自分に確定した検査の一覧（地図リンク・同行者表示） |
| 🚃 交通費申請 | **電車**：区間・運賃（往復対応）／**車**：走行距離 × km 単価 ＋ 駐車場代（レシート画像必須） |
| 📝 50問テスト | 問題プールからランダム出題・自動採点・解説表示・受験履歴 |

### 管理者（`/admin`）
- **検査スケジュール登録**（月単位）：1 件ずつ、または Excel/CSV 貼り付けで一括登録。回答期限の設定
- **リリース**：ボタン 1 つで LINE 連携済みの全検査員へ回答依頼を一斉送信
- **アサイン**：検査ごとに「受注可」の検査員をクリックで割り当て（基本 1 名、人数指定で複数可、未回答者の例外アサインも可）。担当件数・同日重複を表示
- **確定通知**：未通知のアサインを検査員ごとにまとめて LINE 送信
- **交通費**：承認／差戻し／支払済、レシート確認、月別 CSV 出力
- **50問テスト**：問題の登録（CSV 一括可）・出題数/合格点の設定・受験結果一覧
- **検査員**：登録すると 6 桁の「連携コード」を発行。LINE 連携状況の確認・解除
- **店舗マスタ**：旧アプリ（`eisei_stores`）の 79 店舗を引き継ぎ済み

## 業務フロー

```
管理者: 月のスケジュール登録 → リリース（LINE 一斉通知）
検査員: LINE で受注可否を回答
管理者: アサイン画面で担当を決定 → 確定を LINE 通知
検査員: マイスケジュールで確認 → 検査後に交通費申請
管理者: 交通費を承認 → CSV 出力
```

## 構成

| 項目 | 内容 |
|---|---|
| フロント/API | Next.js 16（App Router）— `src/app` |
| DB | Supabase `eisei-kensa` プロジェクトの `kensa_*` テーブル（`supabase/migrations`） |
| ファイル | Supabase Storage `kensa-receipts`（非公開。管理画面から署名付き URL で閲覧） |
| 認証 | 管理者：メール＋パスワード／検査員：LIFF の ID トークンを LINE で検証 → 連携コードで紐づけ |

- 全テーブル RLS 有効・ポリシーなし。DB へは Next.js のサーバー側（service_role）からのみアクセスします。
- 旧アプリの `eisei_*` テーブルには一切変更を加えていません。

## セットアップ

### 1. Supabase
マイグレーション `supabase/migrations/20260928000000_kensa_app_schema.sql` は `eisei-kensa` プロジェクトに適用済みです。

### 2. LINE Developers
1. **Messaging API チャネル**（公式 LINE）
   - チャネルシークレット → `LINE_CHANNEL_SECRET`、長期チャネルアクセストークン → `LINE_CHANNEL_ACCESS_TOKEN`
   - Webhook URL：`https://<Vercel のドメイン>/api/line/webhook`（Webhook の利用を ON）
   - 応答メッセージは OFF 推奨
2. **LINE ログインチャネル**（同じプロバイダー内に作成）
   - チャネル ID → `LINE_LOGIN_CHANNEL_ID`
   - LIFF アプリを追加：サイズ `Full`、エンドポイント URL `https://<Vercel のドメイン>/liff`、Scope `openid` `profile`、友だち追加オプション `On (Aggressive)` → LIFF ID を `NEXT_PUBLIC_LIFF_ID` に
   - チャネルを「公開済み」にする

### 3. Vercel
1. このリポジトリをインポート（Framework: Next.js）
2. `.env.example` の環境変数をすべて設定してデプロイ

### 4. 初期設定
```bash
cp .env.example .env.local   # 値を記入
npm install
node --env-file=.env.local scripts/create-admin.mjs you@example.com 'パスワード10文字以上' '管理者名'
node --env-file=.env.local scripts/setup-richmenu.mjs   # リッチメニュー（scripts/richmenu/richmenu.png）を設定
```

### 5. 検査員の登録
管理画面「検査員」で登録 → 「案内文コピー」で連携コード付きの案内を検査員へ送付 →
検査員が公式 LINE を友だち追加してメニューを開き、コードを入力すると連携完了。

## 開発

```bash
npm run dev     # http://localhost:3000/admin
npm run build
npm run lint    # 型チェック
```

リッチメニュー画像を変更する場合は `scripts/richmenu/richmenu.html` を編集し、2500×1686 の PNG に書き出してください。
