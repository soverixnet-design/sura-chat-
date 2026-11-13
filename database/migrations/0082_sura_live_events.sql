-- SURA CHAT staging-only additive migration 0082.
-- Only public event announcements. No coin/ledger/reward or Sharika changes.
-- Apply only to dedicated SURA staging D1 after verifying its account/database ID.
-- Do not run schema.staging.snapshot.sql on a live D1 database.
CREATE TABLE IF NOT EXISTS sura_live_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 80),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body) <= 600),
  country_code TEXT NOT NULL DEFAULT '' CHECK(country_code = '' OR length(country_code) = 2),
  start_at_ms INTEGER NOT NULL,
  end_at_ms INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'published', 'hidden')),
  author_user_id TEXT NOT NULL REFERENCES users(id),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  CHECK(end_at_ms > start_at_ms)
);
CREATE INDEX IF NOT EXISTS idx_sura_event_public
  ON sura_live_events(status, end_at_ms, start_at_ms);
CREATE INDEX IF NOT EXISTS idx_sura_event_editor
  ON sura_live_events(updated_at_ms DESC);
