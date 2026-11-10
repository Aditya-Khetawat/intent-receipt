-- Passkeys (WebAuthn) for signed confirmations. Bound to the demo browser session, like purchases.

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  public_key_cose TEXT NOT NULL,
  public_key_jwk TEXT NOT NULL,
  alg INTEGER NOT NULL,
  counter INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS passkey_credentials_session ON passkey_credentials (session_id);

-- Single-use challenges; a row is deleted when its response is checked.
CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  intent_id TEXT,
  nonce TEXT,
  expires_at TEXT NOT NULL
);
