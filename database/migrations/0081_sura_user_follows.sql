-- SURA CHAT staging-only additive migration 0081.
-- User follows are a light social relation, NOT CP or a paid friendship feature.
-- Apply ONLY after checking existing SURA D1 schema and before deploying Worker/UI.
-- Never apply database/schema.staging.snapshot.sql as a migration.
CREATE TABLE IF NOT EXISTS user_follows (
  follower_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (follower_user_id, followed_user_id),
  CHECK (follower_user_id <> followed_user_id)
);
CREATE INDEX IF NOT EXISTS idx_sura_following_recent
  ON user_follows(follower_user_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_sura_followers_recent
  ON user_follows(followed_user_id, created_at_ms DESC);
