CREATE TABLE IF NOT EXISTS admin_places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  prefecture TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_places_name
  ON admin_places (name);

CREATE INDEX IF NOT EXISTS idx_admin_places_lat_lng
  ON admin_places (lat, lng);
