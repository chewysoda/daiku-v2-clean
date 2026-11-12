-- Engineering and research objects, stored as typed JSON so new kits don't need new tables.
CREATE TABLE records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                 -- requirement | part | material | calc | sim_run | highlight | participant
                                      -- | interview_note | theme | note | milestone | check | decision_log | deck
  parent_id TEXT,                     -- decision for Lab objects, asset for highlights
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX records_type ON records(type, parent_id);

-- Append-only: the app has no code path that updates or deletes a row here.
CREATE TABLE workflow_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,               -- create | update | delete
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  before TEXT,
  after TEXT,
  why TEXT
);
CREATE INDEX workflow_log_at ON workflow_log(at);

-- Evidence can argue against a claim as well as for it.
ALTER TABLE evidence_links ADD COLUMN stance TEXT NOT NULL DEFAULT 'for';
