## Why

投稿フォームでは現在、位置情報と撮影日時をユーザーが手動入力するか、デフォルト値（東京駅・現在時刻）で埋めている。写真に EXIF メタデータが存在する場合は、ユーザーが何もしなくてもより正確な情報を自動入力できる。取得元を `locationSource` と `capturedAt` として保存することで、データの信頼性も追跡できる。

## What Changes

- 投稿フォームが画像選択時に EXIF を読み取り、撮影日時・緯度・経度を自動入力する
- EXIF が取得できない場合は `navigator.geolocation` と `new Date()` にフォールバックする
- どちらも取得できない場合はデフォルト値（東京駅・現在時刻）を使う
- `locationSource` に `"exif"` / `"device"` / `"fallback"` を設定して投稿時に保存する
- `capturedAt` に EXIF の撮影日時または現在時刻を設定して投稿時に保存する
- 投稿フォームにデータ取得元を示すバッジを表示する（透明性のため）
- D1 の `captured_at` / `location_source` 列は Phase 1（migration 0005）で追加済み

## Capabilities

### New Capabilities

- `exif-metadata-extraction`: 投稿フォームで選択した画像ファイルから EXIF の GPSLatitude / GPSLongitude / DateTimeOriginal を抽出し、フォームに自動入力する機能
- `location-timestamp-fallback`: EXIF が取得できない場合に `navigator.geolocation` / `new Date()` → デフォルト値の順でフォールバックし、取得元を `locationSource` に記録する機能

### Modified Capabilities

（なし。既存の spec ファイルは存在せず、要件変更に該当するスペックはない）

## Impact

**UI（src/components/PostForm.tsx）**

- 画像選択時に EXIF パーサーを呼び出す処理を追加
- geolocation 取得の非同期フローを追加
- 取得元バッジ（exif / device / fallback）の表示を追加
- `capturedAt` / `locationSource` を最終送信ペイロードに含める

**API（worker/index.ts）**

- `captured_at` / `location_source` はすでに INSERT に含まれており追加変更なし

**依存関係**

- EXIF パーサーライブラリ（`exifr`）を追加インストールする
- `navigator.geolocation` は HTTPS / localhost でのみ動作するブラウザ API

**後方互換性**

- D1 の `captured_at` は nullable、`location_source` は default `'fallback'` なので既存レコードへの影響なし
- 送信ペイロードに新フィールドを追加するが Worker 側は optional 扱いのため既存動作を壊さない
