CREATE TABLE IF NOT EXISTS ai_analysis_logs (
  id TEXT PRIMARY KEY,
  analysis_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  lens TEXT NOT NULL,
  source TEXT NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0,
  admin_place_count INTEGER NOT NULL DEFAULT 0,
  tag_summary TEXT NOT NULL DEFAULT '[]',
  gap_summary TEXT NOT NULL DEFAULT '[]',
  input_summary TEXT NOT NULL DEFAULT '{}',
  output_summary TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_created_at
  ON ai_analysis_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_logs_type_scope
  ON ai_analysis_logs (analysis_type, scope, lens);
