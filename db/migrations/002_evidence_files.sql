-- Evidence packs exactly as attached to PayPal provide-evidence (content-addressed).

CREATE TABLE IF NOT EXISTS evidence_files (
  sha256 TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pdf BLOB NOT NULL,
  created_at TEXT NOT NULL
);
