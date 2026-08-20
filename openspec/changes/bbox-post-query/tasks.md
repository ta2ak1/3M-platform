## 1. D1 インデックス追加（マイグレーション）

- [x] 1.1 `migrations/0006_add_lat_lng_index.sql` を作成し `CREATE INDEX IF NOT EXISTS idx_community_posts_lat_lng ON community_posts (lat, lng);` を記述する
- [x] 1.2 `npx wrangler d1 migrations apply 3m-platform-db --remote` でリモートに適用し、完了を確認する

## 2. Worker: bbox クエリ対応

- [x] 2.1 `worker/index.ts` の `readPostsFromD1` に `bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number }` と `limit?: number` を引数として追加する
- [x] 2.2 bbox が揃っている場合は `WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?` を使い、揃っていない場合は既存クエリ（LIMIT 50）にフォールバックするよう分岐する
- [x] 2.3 `limit` は省略時 100、最大 200 に丸める（検証: limit=30 で指定件数が上限になること）
- [x] 2.4 `app.get("/api/posts")` でクエリパラメータ `minLat/maxLat/minLng/maxLng/limit` を取り出し `readPostsFromD1` に渡す

## 3. フロント: api.ts の fetchPosts 拡張

- [x] 3.1 `src/lib/api.ts` の `fetchPosts` 引数に `bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number }` を追加する
- [x] 3.2 bbox が指定されている場合はクエリパラメータとして URL に付加する（検証: ブラウザ DevTools でリクエスト URL を確認）

## 4. フロント: App.tsx にビューポート同期を追加

- [x] 4.1 `PostMap` コンポーネントが Leaflet の map インスタンスまたは `getBounds()` 結果を親へ通知できる仕組みを追加する（`onBoundsChange` コールバック prop）
- [x] 4.2 `App.tsx` に `mapBbox` state を追加し、`onBoundsChange` で更新する
- [x] 4.3 `loadPosts` を `mapBbox` を受け取れる関数に変更し、`fetchPosts(bbox)` を呼び出す
- [x] 4.4 `PostMap` の `moveend` イベントに 500ms debounce を付けて `onBoundsChange` を呼び出す（検証: 高速パン中はリクエストが連発しないこと）
- [x] 4.5 初期表示時に `mapBbox` が揃ってから `loadPosts` を呼ぶよう `useEffect` の依存を調整する

## 5. ビルドと確認

- [x] 5.1 `npm run build` が型エラーなしで通ることを確認する
- [ ] 5.2 本番またはローカル dev で地図を移動すると投稿リストが切り替わることを目視確認する
