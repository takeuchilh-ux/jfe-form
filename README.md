# 衛生検査スケジュール管理（LINE 版）

飲食店の衛生検査を行う **検査員（公式 LINE）** と **管理者（Web 管理画面）** のためのアプリです。
Next.js（Vercel）＋ Supabase ＋ LINE（Messaging API / LIFF）で動きます。

## できること

### 検査員（公式 LINE）

**登録の流れ**：公式 LINE を友だち追加 → 基本情報の登録を自動で案内 → 登録フォームに入力 → 管理者が承認 → LINE で承認通知

基本情報：姓・名／電話番号／メールアドレス／住所（任意・経路検索の出発地）／振込先口座（銀行名・支店名・支店番号・種別・口座番号・口座名義）

**リッチメニュー**
| メニュー | 内容 |
|---|---|
| 📅 マイスケジュール | 受注（確定）した検査の一覧。地図リンク・同行者表示。回答受付中の月があれば案内を表示 |
| 🚗 交通費申請 | **車**：距離（km）を申請。その日に回った店舗を複数選ぶと「出発地 → 店舗A → 店舗B → 出発地」の経路を組み立て、Google の経路検索で合計距離を自動反映（手入力も可）。駐車場代・レシートは任意／**電車**：区間・運賃 |
| 👤 基本情報の変更 | 登録内容（名前・連絡先・口座）の変更 |
| 📝 50問テスト | 問題プールからランダム出題・自動採点（40 点合格）・解説表示・受験履歴 |

受注可否の回答は、管理者がスケジュールをリリースしたときに届く LINE メッセージのボタン（またはマイスケジュール上部の案内）から行います。

### 管理者（`/admin`）
- **検査スケジュール登録**（月単位）：1 件ずつ、または Excel/CSV 貼り付けで一括登録。回答期限の設定
- **リリース**：ボタン 1 つで LINE 連携済みの全検査員へ回答依頼を一斉送信
- **アサイン**：検査ごとに「受注可」の検査員をクリックで割り当て（基本 1 名、人数指定で複数可、未回答者の例外アサインも可）。担当件数・同日重複を表示
- **確定通知**：未通知のアサインを検査員ごとにまとめて LINE 送信
- **交通費**：承認／差戻し／支払済、車は距離（km）と経路・電車は運賃を確認、レシート確認、月別 CSV 出力
- **50問テスト**：問題の登録（CSV 一括可）・出題数/合格点の設定・受験結果一覧
- **検査員**：LINE から登録された検査員の承認（承認時に LINE 通知）、基本情報・口座の確認と編集、無効化
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
| 認証 | 管理者：メール＋パスワード／検査員：LIFF の ID トークンを LINE で検証し、LINE アカウントと検査員を紐づけ |

- 全テーブル RLS 有効・ポリシーなし。DB へは Next.js のサーバー側（service_role）からのみアクセスします。
- 旧アプリの `eisei_*` テーブルには一切変更を加えていません。

## セットアップ

### 1. Supabase
`supabase/migrations` のマイグレーションは `eisei-kensa` プロジェクトに適用済みです。

### 2. LINE Developers
1. **Messaging API チャネル**（公式 LINE）
   - チャネルシークレット → `LINE_CHANNEL_SECRET`、長期チャネルアクセストークン → `LINE_CHANNEL_ACCESS_TOKEN`
   - Webhook URL：`https://<Vercel のドメイン>/api/line/webhook`（Webhook の利用を ON）
   - 応答メッセージは OFF 推奨
2. **LINE ログインチャネル**（同じプロバイダー内に作成）
   - チャネル ID → `LINE_LOGIN_CHANNEL_ID`
   - LIFF アプリを追加：サイズ `Full`、エンドポイント URL `https://<Vercel のドメイン>/liff`、Scope `openid` `profile`、友だち追加オプション `On (Aggressive)` → LIFF ID を `NEXT_PUBLIC_LIFF_ID` に
   - チャネルを「公開済み」にする

### 3. Google マップ（任意・経路検索を使う場合）
Google Cloud で **Routes API** を有効化し、API キーを `GOOGLE_MAPS_API_KEY` に設定します（サーバー側でのみ使用）。

1. https://console.cloud.google.com/ でプロジェクトを作成
2. 「お支払い」で請求先アカウント（クレジットカード）を紐づけ
3. 「API とサービス」→「ライブラリ」で **Routes API** を検索して「有効にする」
4. 「API とサービス」→「認証情報」→「認証情報を作成」→「API キー」
5. 作成したキーの「API の制限」で **Routes API のみ** に制限（Vercel は IP が固定でないため「アプリケーションの制限」はなし）
6. キーを Vercel の環境変数 `GOOGLE_MAPS_API_KEY` に設定して再デプロイ
申請画面に地図を埋め込む場合は **Maps Embed API** 用のキー（HTTP リファラー制限付き）を `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` に設定します。
未設定でも「Googleマップで見る」リンクから経路を確認し、距離を手入力できます。

### 4. Vercel
1. このリポジトリをインポート（Framework: Next.js）
2. `.env.example` の環境変数をすべて設定してデプロイ

### 5. 初期設定
```bash
cp .env.example .env.local   # 値を記入
npm install
node --env-file=.env.local scripts/create-admin.mjs you@example.com 'パスワード10文字以上' '管理者名'
node --env-file=.env.local scripts/setup-richmenu.mjs   # リッチメニュー（scripts/richmenu/richmenu.png）を設定
```

### 6. 検査員の登録
公式 LINE の友だち追加 URL（QR コード）を検査員に共有 → 検査員が LINE で基本情報を登録 →
管理画面「検査員」で内容を確認して「承認」。

## 開発

```bash
npm run dev     # http://localhost:3000/admin
npm run build
npm run lint    # 型チェック
```

リッチメニュー画像を変更する場合は `scripts/richmenu/richmenu.html` を編集し、2500×1686 の PNG に書き出してください。
