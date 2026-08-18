CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  photo_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at
  ON community_posts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_lat_lng
  ON community_posts (lat, lng);
