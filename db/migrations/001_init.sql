-- IntentReceipt schema v1 (see HACKATHON_BRIEF.md §7)

CREATE TABLE IF NOT EXISTS buyers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email_demo TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id),
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  base_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD'
);

CREATE TABLE IF NOT EXISTS variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL UNIQUE,
  attributes_json TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  est_delivery_days INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES buyers(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES agent_sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id);

CREATE TABLE IF NOT EXISTS intents (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  buyer_id TEXT NOT NULL REFERENCES buyers(id),
  status TEXT NOT NULL,
  record_json TEXT NOT NULL,
  record_sha256 TEXT,
  scenario TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
CREATE INDEX IF NOT EXISTS idx_intents_session ON intents(session_id);

CREATE TABLE IF NOT EXISTS ledger (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  intent_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  key_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_intent ON ledger(intent_id);

-- Append-only enforcement (invariant I2).
CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  intent_id TEXT NOT NULL REFERENCES intents(id),
  paypal_order_id TEXT NOT NULL,
  paypal_capture_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_intent ON orders(intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_capture ON orders(paypal_capture_id);

CREATE TABLE IF NOT EXISTS fulfillment_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
  carrier TEXT,
  tracking_no TEXT,
  occurred_at TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_order ON fulfillment_events(order_id);

CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY,
  paypal_dispute_id TEXT NOT NULL UNIQUE,
  order_id TEXT REFERENCES orders(id),
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0,
  scenario TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disputes_order ON disputes(order_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);

CREATE TABLE IF NOT EXISTS dispute_messages (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id),
  author_role TEXT NOT NULL,
  content TEXT NOT NULL,
  posted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON dispute_messages(dispute_id);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_sha256 TEXT NOT NULL,
  output_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  cached INTEGER NOT NULL DEFAULT 0,
  cache_origin TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_dispute ON analyses(dispute_id);
CREATE INDEX IF NOT EXISTS idx_analyses_input ON analyses(input_sha256);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  dispute_id TEXT NOT NULL REFERENCES disputes(id),
  type TEXT NOT NULL,
  request_preview_json TEXT NOT NULL,
  response_json TEXT,
  simulated INTEGER NOT NULL DEFAULT 1,
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_actions_dispute ON actions(dispute_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  paypal_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  verified INTEGER NOT NULL,
  simulated INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
