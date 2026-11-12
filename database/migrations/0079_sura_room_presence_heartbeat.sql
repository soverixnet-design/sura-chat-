-- SURA CHAT staging-only additive migration: room presence heartbeat.
-- Review the staging DB and take a D1 recovery bookmark before running.
-- Run exactly once (ALTER TABLE is not idempotent). NEVER run on Sharika.
-- Do not set PRESENCE_TTL_ENABLED=true until all active clients send heartbeats.
ALTER TABLE room_memberships ADD COLUMN last_seen_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE room_memberships SET last_seen_at_ms = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_room_memberships_active_seen ON room_memberships(room_id, last_seen_at_ms) WHERE left_at IS NULL;
