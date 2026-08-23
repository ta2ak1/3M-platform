## Context

現在の投稿フォームでは、ユーザーが位置情報と撮影日時をフォームで手動入力するか、デフォルト値（東京駅・現在時刻）がそのまま使われる。スマートフォンで撮影した画像には多くの場合 EXIF に正確な GPS 座標と撮影日時が含まれているため、ユーザーが特に操作しなくても自動入力できる。

D1 には migration 0005 で `captured_at`（nullable TEXT）と `location_source`（NOT NULL TEXT, default `'fallback'`）がすでに追加されており、Worker の INSERT/SELECT もこれらを扱う状態になっている。今回の変更はフロントエンド（`PostForm.tsx`）と、EXIF パーサー依存の追加が主な作業範囲になる。

## Goals / Non-Goals

**Goals:**

- 画像選択時に EXIF から緯度・経度・撮影日時を自動抽出してフォームに入力する
- EXIF が取れない場合は `navigator.geolocation` → `new Date()` → デフォルト値の順にフォールバックする
- 取得元（`locationSource`）と撮影日時（`capturedAt`）を投稿時に Worker へ送信して D1 に保存する
- フォームに取得元バッジを表示してユーザーがデータ出所を確認できるようにする

**Non-Goals:**

- 地図上でのピン直接操作（既存機能は変更しない）
- EXIF の他フィールド（カメラ機種、ISO など）の取得・保存
- Worker 側の新しい変更（Phase 1 で対応済み）
- オフライン EXIF キャッシュや Service Worker との統合

## Decisions

### D1: `exifr` を EXIF パーサーとして採用

**選択肢**: `piexifjs`、`exif-js`、`exifr`  
**理由**: `exifr` は Tree-shakeable で GPS・日時フィールドのみの部分読み取りができる。ブラウザで動作し、async/await 対応で TypeScript 型が充実している。バンドルサイズは GPS + 日時のみ読む場合に最小化できる。

### D2: EXIF 取得は画像選択時（`onChange`）に実行する

**選択肢**: プレビュー生成と同時、precheck 直前  
**理由**: ユーザーがフォームを確認している間に非同期処理が終わる。precheck 直前に行うと UI の応答が遅くなる。

### D3: geolocation 取得はタイムアウト 5 秒で試みる

**理由**: モバイルで GPS ロックに時間がかかることがある。5 秒で取れない場合は fallback に落とす。ユーザーを長時間待たせない。

### D4: `locationSource` は `"exif"` / `"device"` / `"fallback"` の 3 値のみ（Phase 1 定義済み）

`"manual"` はこの変更では使わない。地図ピン操作で位置変更した際の将来拡張として予約する。

## Risks / Trade-offs

- **EXIF に GPS が含まれない画像**（スクリーンショット、SNS 転載など）→ `navigator.geolocation` へフォールバックするため問題なし
- **geolocation 拒否または非 HTTPS 環境** → `"fallback"` になる。ローカル開発 http://localhost は Chrome で geolocation が使えるが、http:// の本番ドメインでは使えない。今のプロダクションは HTTPS なので問題なし
- **`exifr` のバンドルサイズ増加** → GPS + 日時のみ読む `exifr/src/extras/full` の部分インポートを使うことで最小化。Vite の tree-shaking で未使用部分は除外される
- **日時タイムゾーン** → EXIF の `DateTimeOriginal` はローカル時刻でタイムゾーン情報を持たない場合が多い。`exifr` が返す `Date` オブジェクトをそのまま ISO 8601 に変換する。精度要件はゆるいので許容する

## Migration Plan

1. `exifr` を npm インストール
2. `PostForm.tsx` に EXIF 読み取りと geolocation フォールバックを実装
3. `npm run build` でビルド確認
4. `npm run deploy` でデプロイ（Worker 変更なし）

ロールバック: PostForm の変更のみなので git revert 一発で戻せる。D1 変更は Phase 1 で済んでいるため今回はなし。
