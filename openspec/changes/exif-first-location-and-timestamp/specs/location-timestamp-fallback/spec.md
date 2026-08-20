## ADDED Requirements

### Requirement: EXIF 取得失敗時にデバイス位置情報と現在時刻へフォールバックする
EXIF から位置情報が取得できなかった場合、システムは `navigator.geolocation.getCurrentPosition` でデバイスの現在位置取得を試みなければならない（SHALL）。取得に成功した場合、フォームの lat / lng を自動入力し `locationSource` を `"device"` に設定しなければならない（SHALL）。どちらも取得できない場合は既存のデフォルト値（東京駅）を使用し `locationSource` を `"fallback"` に設定しなければならない（SHALL）。`capturedAt` は EXIF から取得できなかった場合は常に現在時刻（`new Date().toISOString()`）を使用しなければならない（SHALL）。

#### Scenario: EXIF なし・geolocation 許可済みの場合
- **WHEN** EXIF に GPS がなく、デバイス位置情報の許可が得られている
- **THEN** デバイスの現在位置がフォームの lat / lng に設定される
- **THEN** locationSource が "device" になる
- **THEN** capturedAt が現在時刻 ISO 8601 になる
- **THEN** 取得元バッジに "デバイス位置" が表示される

#### Scenario: EXIF なし・geolocation 拒否またはタイムアウト（5 秒）の場合
- **WHEN** EXIF に GPS がなく、geolocation が拒否またはタイムアウトする
- **THEN** デフォルト値（東京駅: lat 35.681236, lng 139.767125）がフォームに設定される
- **THEN** locationSource が "fallback" になる
- **THEN** capturedAt が現在時刻 ISO 8601 になる
- **THEN** 取得元バッジに "デフォルト" が表示される

### Requirement: 取得元バッジをフォームに表示する
フォームは現在の位置情報取得元を示すバッジを表示しなければならない（SHALL）。バッジは `locationSource` の値に応じて "EXIF"・"デバイス位置"・"デフォルト" のいずれかを表示し、ユーザーがデータ出所を確認できるようにしなければならない（SHALL）。

#### Scenario: locationSource が exif の場合
- **WHEN** EXIF から位置情報が取得されている
- **THEN** バッジに "EXIF" が表示される

#### Scenario: locationSource が device の場合
- **WHEN** デバイス位置情報から取得されている
- **THEN** バッジに "デバイス位置" が表示される

#### Scenario: locationSource が fallback の場合
- **WHEN** デフォルト値が使われている
- **THEN** バッジに "デフォルト" が表示される
