## 1. 依存関係の追加

- [x] 1.1 `npm install exifr` を実行して EXIF パーサーをインストールする（検証: `package.json` に `exifr` が追加されること）
- [x] 1.2 `npm run build` でビルドが通ることを確認する

## 2. EXIF 読み取りユーティリティの実装

- [x] 2.1 `src/components/PostForm.tsx` に `readExifLocation` 関数を追加する。`exifr` の GPS + 日時のみの部分インポートで `{ latitude, longitude, DateTimeOriginal }` を返す
- [x] 2.2 EXIF 解析エラー・フィールド欠損のどちらでも安全に `null` を返すよう try/catch で保護する

## 3. geolocation フォールバックの実装

- [x] 3.1 `getDeviceLocation` 関数を追加する。`navigator.geolocation.getCurrentPosition` をラップし、タイムアウト 5000ms・失敗時 `null` を返す Promise を返す
- [x] 3.2 geolocation が使えない環境（`!navigator.geolocation`）でも `null` を返して安全に動作することを確認する

## 4. 画像選択時の自動入力フローを PostForm に組み込む

- [x] 4.1 `handleFileChange`（または既存の `onChange` ハンドラ）で EXIF 読み取り → geolocation → fallback の順に実行する
- [x] 4.2 取得結果に応じて `lat`・`lng`・`capturedAt`・`locationSource` の state を更新する
- [x] 4.3 EXIF/geolocation 取得中に「位置情報を取得中...」のインジケーターを表示し、完了後に消える

## 5. 取得元バッジの表示

- [x] 5.1 `locationSource` の値（`"exif"` / `"device"` / `"fallback"`）に応じて "EXIF" / "デバイス位置" / "デフォルト" バッジをフォームに表示する（検証: 各ケースで対応するバッジが表示されること）

## 6. 送信ペイロードへの組み込み

- [x] 6.1 `handleFinalSubmit`（最終送信）で `capturedAt` と `locationSource` を `FormData` に追加する
- [x] 6.2 `src/lib/api.ts` の `submitPost` で `capturedAt` と `locationSource` を送信フィールドとして含める（すでに Worker 側は受け取り済み）

## 7. ビルドと最終確認

- [x] 7.1 `npm run build` が型エラーなしで通ることを確認する
- [x] 7.2 ローカル `npm run dev` で画像選択時に lat / lng が自動入力され、取得元バッジが表示されることを目視確認する
- [x] 7.3 EXIF のない画像（スクリーンショット等）でフォールバック（デバイス位置 or デフォルト）が動くことを確認する
