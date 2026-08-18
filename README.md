# 3M Platform

地域の「面白い・魅力的な場所」を、写真と一言で共有できる Cloudflare ベースの Web アプリケーションです。

ユーザーが自分の地域のおすすめスポットを投稿し、地図上で確認できる仕組みを提供します。管理側の地域データは GeoJSON を元に初期投入し、住民投稿と合わせて表示します。

## 主な機能

- 地図上での投稿表示
- 画像アップロードと保存
- 投稿タイトル・コメント・位置情報の登録
- 管理用 seed データの初期読み込み
- Cloudflare D1 による投稿データ管理
- Cloudflare R2 による画像保存と配信
- Workers API による投稿・取得処理

## 技術スタック

- React 19 + TypeScript + Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Leaflet
- Hono
- React Compiler

## プロジェクト構成

```text
.
├── public/
├── src/
│   ├── assets/
│   │   └── seed.geojson
│   ├── components/
│   ├── lib/
│   ├── App.tsx
│   ├── main.tsx
│   ├── types.ts
│   └── index.css
├── worker/
│   ├── index.ts
│   └── geojson.d.ts
├── migrations/
│   ├── 0001_create_community_posts.sql
│   └── 0002_create_admin_places.sql
├── package.json
├── vite.config.ts
├── wrangler.jsonc
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── tsconfig.worker.json
└── README.md
```

## 事前準備

1. Node.js をインストール
2. Cloudflare アカウントを作成
3. Wrangler をログイン

```bash
npm install
npx wrangler login
```

## D1 / R2 の作成

Cloudflare のダッシュボードまたは CLI で以下を作成してください。

```bash
npx wrangler d1 create 3m-platform-db
npx wrangler r2 bucket create 3m-platform-photos
```

作成後、`wrangler.jsonc` の `database_id` と `bucket_name` を実際の値に合わせて設定します。

## 環境変数とシークレット管理

このプロジェクトでは、API キーやシークレットをソースコードへ直書きしません。

- Cloudflare の Secrets / Environment Variables を利用
- 公開リポジトリには認証情報を含めない
- 必要最小限の権限のみを持つ設定にする

`wrangler.jsonc` では公開に必要な設定だけを管理し、実際の機密情報は Cloudflare 側の環境変数や Secrets Store で保持してください。

## ローカル開発

```bash
npm run dev
```

ブラウザで Vite のローカルアドレスを確認し、アプリを起動してください。

## ビルド

```bash
npm run build
```

## デプロイ

```bash
npm run deploy
```

`wrangler.jsonc` の設定が正しければ Cloudflare Workers へデプロイされます。

## データセットについて

初期管理データは `src/assets/seed.geojson` を利用しています。

- Worker 起動時にこの GeoJSON を読み込む
- `admin_places` テーブルへ初期データを投入
- 地図上に管理データとユーザー投稿を重ねて表示

## 主要 API

- `GET /api/posts` : 投稿一覧を取得
- `POST /api/posts` : 新規投稿を作成
- `GET /api/seed` : 管理データを取得
- `GET /uploads/*` : R2 に保存された画像を配信

## セキュリティに関する注意

- API キーやシークレットを Git 履歴に残さない
- 公開リポジトリでは `.env` や秘密情報ファイルを含めない
- Cloudflare の認証情報は必要最小限の権限で管理する
- R2 や D1 の公開範囲は、必要に応じて Access 制限をかける

## ライセンス

このプロジェクトは個人開発／社内利用を前提としており、特にライセンス表記が必要な場合は別途整理してください。
