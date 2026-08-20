## ADDED Requirements

### Requirement: 地図ビューポートの変化に合わせて投稿を再取得する
フロントエンドは Leaflet マップの `moveend` イベントを購読し、500ms の debounce を挟んで `fetchPosts` を bbox 付きで呼び出さなければならない（SHALL）。bbox は `map.getBounds()` から `minLat`/`maxLat`/`minLng`/`maxLng` を取得して渡さなければならない（SHALL）。

#### Scenario: 地図を移動した後に投稿リストが更新される
- **WHEN** ユーザーが地図をパンまたはズームして移動を完了する
- **THEN** 500ms 以内に新しい bbox で `GET /api/posts` が呼び出される
- **THEN** 返された投稿でリストが更新される

#### Scenario: 移動中は複数回リクエストが乱発しない
- **WHEN** ユーザーが 500ms 以内に連続して地図を動かす
- **THEN** リクエストは最後の移動完了後 500ms 経過してから 1 回だけ送信される

### Requirement: 地図の初期表示時も bbox を渡して投稿を取得する
アプリ初期化時、地図の初期ビューポートに対応する bbox で `fetchPosts` を呼び出さなければならない（SHALL）。

#### Scenario: 初期表示でビューポート内の投稿が表示される
- **WHEN** アプリが初めて表示される
- **THEN** 初期ビューポートの bbox を使って投稿が取得される
- **THEN** ビューポート外の投稿は含まれない
