-- Daiku schema draft. Files live in the user's library folder; SQLite holds metadata only.
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                 -- image | video | pdf | link | 3d
  title TEXT NOT NULL,
  file_path TEXT,                     -- path inside the library folder
  preview TEXT,                       -- bundled sample key, for demo data only
  source_url TEXT,
  credit TEXT,                        -- maker or rights holder; empty = "no source yet"
  via TEXT,                           -- site it was captured from
  captured_at TEXT NOT NULL,
  provenance TEXT NOT NULL DEFAULT 'unknown', -- human | ai | unknown; a user flag, never a detector's verdict
  palette_lab TEXT NOT NULL DEFAULT '[]',     -- JSON [{l,a,b,weight,hex}]
  width INTEGER,
  height INTEGER,
  tags TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE assets_fts USING fts5(
  title, credit, via, tags, notes,
  content='assets', content_rowid='rowid'
);
CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, title, credit, via, tags, notes)
  VALUES (new.rowid, new.title, new.credit, new.via, new.tags, new.notes);
END;
CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, title, credit, via, tags, notes)
  VALUES ('delete', old.rowid, old.title, old.credit, old.via, old.tags, old.notes);
END;
CREATE TRIGGER assets_au AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, title, credit, via, tags, notes)
  VALUES ('delete', old.rowid, old.title, old.credit, old.via, old.tags, old.notes);
  INSERT INTO assets_fts(rowid, title, credit, via, tags, notes)
  VALUES (new.rowid, new.title, new.credit, new.via, new.tags, new.notes);
END;

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  share TEXT NOT NULL DEFAULT '{}',   -- JSON: client-share headline, summary, recipient
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE board_items (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                 -- image | sticky | text | section | palette | connector
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL,
  rotation REAL NOT NULL DEFAULT 0,
  z INTEGER NOT NULL DEFAULT 0,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
CREATE INDEX board_items_board ON board_items(board_id);

CREATE TABLE claims (
  id TEXT PRIMARY KEY,
  board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE evidence_links (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,          -- claim | score
  target_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX evidence_target ON evidence_links(target_type, target_id);

CREATE TABLE decisions (
  id TEXT PRIMARY KEY,
  board_id TEXT REFERENCES boards(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE concepts (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  flag TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE criteria (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weight REAL NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES criteria(id) ON DELETE CASCADE,
  value REAL NOT NULL,
  is_assumption INTEGER NOT NULL DEFAULT 1,  -- unsourced scores are assumptions until evidence is linked
  UNIQUE (concept_id, criterion_id)
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  parent_id TEXT,
  author TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  asset_id TEXT,
  pin_x REAL,
  pin_y REAL,
  created_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
