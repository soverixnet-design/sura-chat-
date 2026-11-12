-- SURA CHAT staging: additive personal safety tables.
-- Preserve existing users, room memberships, voice participants and wallet data.
-- Apply to the isolated SURA staging D1 before deploying the Worker safety endpoints.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms > 0),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
  ON user_blocks(blocked_user_id, blocker_user_id);

CREATE TABLE IF NOT EXISTS user_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK(reason IN
    ('harassment','spam','impersonation','hate','sexual_content','violence','other')),
  details TEXT NOT NULL DEFAULT '' CHECK(length(details) <= 500),
  context_type TEXT NOT NULL CHECK(context_type IN ('profile','message','moment','room')),
  context_id TEXT NOT NULL DEFAULT '' CHECK(length(context_id) <= 128),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK(status IN ('open','reviewing','resolved','dismissed')),
  created_at_ms INTEGER NOT NULL CHECK(created_at_ms > 0),
  reviewed_by_user_id TEXT REFERENCES users(id),
  reviewed_at_ms INTEGER,
  review_note TEXT NOT NULL DEFAULT '' CHECK(length(review_note) <= 500),
  CHECK (reporter_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_review_queue
  ON user_reports(status, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_target
  ON user_reports(reporter_user_id, target_user_id, created_at_ms DESC);
