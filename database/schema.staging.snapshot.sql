-- SURA CHAT staging D1 schema snapshot, exported 2026-11-12.
-- For comparison/review only. DO NOT apply this file to an existing D1 database.
-- Internal Cloudflare tables and sqlite autoindexes are excluded.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_key TEXT,
  country_code TEXT CHECK(country_code IS NULL OR length(country_code) = 2),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, bio TEXT NOT NULL DEFAULT '');

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  country_code TEXT,
  seat_count INTEGER NOT NULL DEFAULT 8 CHECK(seat_count IN (4, 8, 12, 16)),
  theme_key TEXT NOT NULL DEFAULT 'royal-violet',
  announcement TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'locked', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_rooms_country_status ON rooms(country_code, status, created_at);

CREATE TABLE room_memberships (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  permission TEXT NOT NULL DEFAULT 'member' CHECK(permission IN ('member', 'admin', 'owner')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  left_at TEXT, chat_since_id INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(room_id, user_id)
);

CREATE TABLE room_seats (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  seat_number INTEGER NOT NULL CHECK(seat_number BETWEEN 1 AND 16),
  user_id TEXT REFERENCES users(id),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK(is_locked IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(room_id, seat_number),
  UNIQUE(room_id, user_id)
);

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  wallet_type TEXT NOT NULL CHECK(wallet_type IN ('main', 'salary', 'seller')),
  currency TEXT NOT NULL DEFAULT 'COIN',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, wallet_type)
);

CREATE TABLE wallet_ledger (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL REFERENCES wallets(id),
  amount_units INTEGER NOT NULL CHECK(amount_units <> 0),
  operation TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wallet_ledger_wallet_time ON wallet_ledger(wallet_id, created_at);

CREATE TABLE gifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('cp', 'popular', 'luxury', 'friendship')),
  price_coins INTEGER NOT NULL CHECK(price_coins > 0),
  cp_eligible INTEGER NOT NULL DEFAULT 0 CHECK(cp_eligible IN (0, 1)),
  media_key TEXT,
  audio_key TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1))
);

CREATE TABLE gift_transactions (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL REFERENCES users(id),
  recipient_user_id TEXT NOT NULL REFERENCES users(id),
  room_id TEXT REFERENCES rooms(id),
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  total_coins INTEGER NOT NULL CHECK(total_coins > 0),
  ledger_id TEXT NOT NULL UNIQUE REFERENCES wallet_ledger(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(sender_user_id <> recipient_user_id)
);

CREATE TABLE cp_relations (
  id TEXT PRIMARY KEY,
  user_a_id TEXT NOT NULL REFERENCES users(id),
  user_b_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'declined', 'ended')),
  qualifying_gift_coins INTEGER NOT NULL DEFAULT 0 CHECK(qualifying_gift_coins >= 0),
  user_a_accepted_at TEXT,
  user_b_accepted_at TEXT,
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_a_id, user_b_id),
  CHECK(user_a_id < user_b_id)
);

CREATE TABLE agency_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK(role IN ('bd', 'agency', 'host')),
  agency_owner_id TEXT REFERENCES users(id),
  bd_user_id TEXT REFERENCES users(id),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, role)
);

CREATE TABLE coin_sellers (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id)
);

CREATE TABLE catalog_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL CHECK(item_type IN ('frame', 'entry', 'medal', 'noble', 'tag', 'vip', 'theme')),
  name TEXT NOT NULL,
  media_key TEXT,
  audio_key TEXT,
  price_coins INTEGER NOT NULL DEFAULT 0 CHECK(price_coins >= 0),
  valid_days INTEGER CHECK(valid_days IS NULL OR valid_days > 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1))
);

CREATE TABLE user_inventory (
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL REFERENCES catalog_items(id),
  obtained_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  PRIMARY KEY(user_id, item_id)
);

CREATE TABLE public_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL CHECK(json_valid(setting_value))
);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  email_normalized TEXT NOT NULL UNIQUE,
  salt_b64 TEXT NOT NULL,
  password_hash_b64 TEXT NOT NULL,
  iterations INTEGER NOT NULL CHECK(iterations >= 100000),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE auth_sessions (
  token_sha256 TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id, expires_at_ms);

CREATE TABLE room_audit_events (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN ('create', 'join', 'leave', 'sit', 'stand')),
  seat_number INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_room_events_room ON room_audit_events(room_id, created_at);

CREATE TABLE room_bans (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  banned_by_user_id TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE room_moderation_events (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  target_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL CHECK(action IN
    ('update_settings', 'lock_seat', 'unlock_seat', 'assign_admin', 'remove_admin', 'kick', 'block', 'unblock')),
  seat_number INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_room_moderation_events_room
  ON room_moderation_events(room_id, created_at);

CREATE TABLE room_voice_meetings (
  room_id TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  meeting_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE room_voice_participants (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('speaker', 'listener')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE room_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_user_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'message' CHECK(kind IN ('message', 'join')),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 280),
  created_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_room_messages_room_id ON room_messages(room_id, id);

CREATE TABLE user_public_id_aliases (legacy_public_id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE INDEX idx_public_id_alias_user ON user_public_id_aliases(user_id);

CREATE TABLE moments (id INTEGER PRIMARY KEY AUTOINCREMENT, author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 500), created_at_ms INTEGER NOT NULL);

CREATE INDEX idx_moments_recent ON moments(id DESC);

CREATE INDEX idx_moments_author ON moments(author_user_id, id DESC);

CREATE TABLE direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 500),
  created_at_ms INTEGER NOT NULL,
  CHECK(sender_user_id <> recipient_user_id)
);

CREATE INDEX idx_dm_sender_recent ON direct_messages(sender_user_id, id DESC);

CREATE INDEX idx_dm_recipient_recent ON direct_messages(recipient_user_id, id DESC);
