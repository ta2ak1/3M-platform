## ADDED Requirements

### Requirement: GET /api/posts がバウンディングボックスクエリをサポートする
Worker の `GET /api/posts` エンドポイントは `minLat`、`maxLat`、`minLng`、`maxLng` のクエリパラメータを受け付けなければならない（SHALL）。4 つ全て数値として有効な場合、`WHERE lat BETWEEN minLat AND maxLat AND lng BETWEEN minLng AND maxLng` で絞り込んだ結果を返さなければならない（SHALL）。bbox パラメータが 1 つでも欠けている場合または数値として無効な場合は、既存の `ORDER BY created_at DESC LIMIT 50` の動作にフォールバックしなければならない（SHALL）。

#### Scenario: bbox パラメータ全指定
- **WHEN** `GET /api/posts?minLat=35.6&maxLat=35.8&minLng=139.7&maxLng=139.9` でリクエストする
- **THEN** lat が 35.6〜35.8 かつ lng が 139.7〜139.9 の範囲内の投稿のみ返される
- **THEN** ステータスコード 200 が返される

#### Scenario: bbox パラメータ未指定（後方互換）
- **WHEN** `GET /api/posts` をクエリパラメータなしでリクエストする
- **THEN** 最新 50 件が返される（既存動作と同じ）

#### Scenario: bbox パラメータが不完全（一部欠損）
- **WHEN** `minLat` だけ指定して他の bbox パラメータがない状態でリクエストする
- **THEN** bbox を無視して最新 50 件にフォールバックする

### Requirement: limit クエリパラメータをサポートする
`GET /api/posts` は `limit` クエリパラメータを受け付けなければならない（SHALL）。省略時は 100、最大値は 200 とし、200 を超える値は 200 に丸めなければならない（SHALL）。

#### Scenario: limit 指定あり
- **WHEN** `GET /api/posts?minLat=35.6&maxLat=35.8&minLng=139.7&maxLng=139.9&limit=30` でリクエストする
- **THEN** 最大 30 件が返される

#### Scenario: limit 省略
- **WHEN** bbox 付きで limit を省略してリクエストする
- **THEN** 最大 100 件が返される
