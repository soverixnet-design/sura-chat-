-- SURA staging only. Apply BEFORE deploying phone login Worker code.
-- Additive migration: no user/credential rewrites and no historical account removal.
-- Phone possession is NOT verified: OTP is intentionally not collected.
-- Phone-only accounts retain an internal non-routable email_normalized identifier
-- to satisfy the existing NOT NULL user_credentials column without table rebuild.
CREATE TABLE IF NOT EXISTS user_phone_logins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL UNIQUE CHECK(
    length(phone_e164) BETWEEN 9 AND 16 AND
    phone_e164 GLOB '+[1-9]*' AND
    phone_e164 NOT GLOB '*[^+0-9]*'
  ),
  verified_at_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sura_user_phone_login ON user_phone_logins(phone_e164);
