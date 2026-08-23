ALTER TABLE community_posts
  ADD COLUMN ai_tags TEXT NOT NULL DEFAULT '[]';

ALTER TABLE community_posts
  ADD COLUMN human_tags TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_community_posts_ai_tags
  ON community_posts (ai_tags);

CREATE INDEX IF NOT EXISTS idx_community_posts_human_tags
  ON community_posts (human_tags);