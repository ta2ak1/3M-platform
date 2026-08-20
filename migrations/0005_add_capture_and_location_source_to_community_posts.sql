ALTER TABLE community_posts
  ADD COLUMN captured_at TEXT;

ALTER TABLE community_posts
  ADD COLUMN location_source TEXT NOT NULL DEFAULT 'fallback';

CREATE INDEX IF NOT EXISTS idx_community_posts_captured_at
  ON community_posts (captured_at DESC);
