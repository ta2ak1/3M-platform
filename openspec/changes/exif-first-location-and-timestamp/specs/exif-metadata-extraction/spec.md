## ADDED Requirements

### Requirement: EXIF から位置情報・撮影日時を自動抽出する
投稿フォームで画像ファイルが選択されたとき、システムは EXIF から GPS 座標（緯度・経度）と撮影日時（DateTimeOriginal）の抽出を試みなければならない（SHALL）。抽出に成功した場合、フォームの緯度・経度・日時フィールドに自動入力し、`locationSource` を `"exif"` に設定しなければならない（SHALL）。

#### Scenario: EXIF に GPS と日時が存在する場合
- **WHEN** ユーザーが GPS 情報と DateTimeOriginal を含む画像ファイルを選択する
- **THEN** フォームの lat / lng が EXIF の値で自動入力される
- **THEN** capturedAt が EXIF の DateTimeOriginal の ISO 8601 表現に設定される
- **THEN** 取得元バッジに "EXIF" が表示される

#### Scenario: EXIF に GPS のみ存在し日時がない場合
- **WHEN** ユーザーが GPS はあるが DateTimeOriginal がない画像ファイルを選択する
- **THEN** フォームの lat / lng が EXIF の値で自動入力される
- **THEN** capturedAt は現在時刻にフォールバックする

#### Scenario: EXIF が存在しないまたは解析失敗の場合
- **WHEN** ユーザーが EXIF のない画像ファイルを選択する
- **THEN** システムはデバイス位置情報取得フォールバックに進む
