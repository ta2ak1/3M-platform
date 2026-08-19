ALTER TABLE community_posts
  ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_community_posts_tags
  ON community_posts (tags);
