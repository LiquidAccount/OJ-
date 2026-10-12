CREATE TABLE IF NOT EXISTS desktop_site_title (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_title TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
