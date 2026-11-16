-- Additive only. Keep LIVEKIT_ENABLED off until this and proxy authorization are deployed.
CREATE TABLE IF NOT EXISTS sura_livekit_participants (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  identity TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('listener','speaker')),
  status TEXT NOT NULL CHECK(status IN ('active','revoking')),
  PRIMARY KEY(room_id,user_id)
);
