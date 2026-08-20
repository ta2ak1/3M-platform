## Why

`GET /api/posts` は現在、`ORDER BY created_at DESC LIMIT 50` で最新 50 件を固定返却する。投稿数が増えると地図表示に関係ないエリアの投稿まで取得し、かつ 50 件制限で現在地付近の投稿が欠落する問題が起きる。地図の表示ビューポートに対応したバウンディングボックス（bbox）クエリを追加することで、表示中のエリアに絞った投稿のみを効率よく取得できる。

## What Changes

- `GET /api/posts` にオプションクエリパラメータを追加する
  - `minLat`, `maxLat`, `minLng`, `maxLng`（4 つ揃った場合のみ bbox 絞り込みを有効化）
  - `limit`（省略時は 100、最大 200）
- bbox 指定がある場合は D1 クエリを `WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?` に変更する
- bbox 指定がない場合は既存の `ORDER BY created_at DESC LIMIT 50` を維持する（後方互換）
- D1 に `(lat, lng)` 複合インデックスをマイグレーションで追加する
- `api.ts` の `fetchPosts` が bbox を受け取れるよう拡張する
- `App.tsx` で地図の現在ビューポートを bbox として `fetchPosts` に渡し、マップ移動時に debounce（500ms）付きで再取得する

## Capabilities

### New Capabilities

- `bbox-post-query-api`: Worker の `GET /api/posts` がバウンディングボックスクエリをサポートする機能
- `map-viewport-sync`: フロントエンドが Leaflet の地図ビューポートを監視し、bbox を自動的に API に渡してポストリストを更新する機能

### Modified Capabilities

（なし。既存の spec ファイルは存在せず、後方互換を保つため既存動作は変えない）

## Impact

**API（worker/index.ts）**
- `readPostsFromD1` の引数に bbox オプションを追加
- bbox 有無で SQL を分岐
- bbox パラメータのバリデーション（数値チェック、min < max チェック）

**D1 スキーマ**
- migration 0006: `CREATE INDEX idx_community_posts_lat_lng ON community_posts (lat, lng)` を追加
- データ変更なし、後方互換あり

**フロント（src/lib/api.ts）**
- `fetchPosts` の引数に `bbox?: { minLat, maxLat, minLng, maxLng }` を追加
- クエリパラメータとして URL に付加

**フロント（src/App.tsx）**
- Leaflet の `moveend` イベントを購読して現在ビューポートの bbox を取得
- 500ms debounce で `fetchPosts` を再呼び出し
- 地図の初期表示時にも bbox 付きで取得

**依存関係**
- 新規外部ライブラリなし
