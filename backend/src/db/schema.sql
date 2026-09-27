-- Reference snapshot of the SQLite schema.
--
-- THIS FILE IS NOT READ AT RUNTIME. The authoritative definition is the
-- `SCHEMA_SQL` constant in `src/db/schema.ts`, which is what `initDatabase()`
-- executes. This file exists so the schema can be read (and diffed) without
-- wading through TypeScript.
--
-- `src/test/schema_consistency.test.ts` fails if this file and SCHEMA_SQL stop
-- matching, so edit either one and the other must follow.
--
-- Engine: SQLite via `node:sqlite`. Do not rewrite this in PostgreSQL dialect:
-- the types and `datetime('now')` defaults below are what the server actually
-- runs. (An earlier revision of this file claimed to be a "PostgreSQL Production
-- Schema" while being neither PostgreSQL nor accurate.)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  password_hash TEXT,
  is_2fa_enabled INTEGER DEFAULT 0,
  is_bot INTEGER DEFAULT 0,
  last_seen_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  device_type TEXT NOT NULL,
  client_version TEXT,
  refresh_token_hash TEXT,
  push_token TEXT,
  ip_address TEXT,
  last_active_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  is_revoked INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS identity_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_sender_keys (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wrapped_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(chat_id, sender_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_group_sender_keys_recipient ON group_sender_keys(recipient_id, chat_id);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'DIRECT',
  title TEXT,
  description TEXT,
  avatar_url TEXT,
  creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_e2ee INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_members (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER',
  permissions_bitmask INTEGER DEFAULT 0,
  last_read_message_id TEXT,
  unread_count INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  cleared_at TEXT,
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reply_to_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'TEXT',
  content_text TEXT,
  ciphertext_payload TEXT,
  media_url TEXT,
  media_metadata TEXT,
  is_pinned INTEGER DEFAULT 0,
  is_edited INTEGER DEFAULT 0,
  edit_timestamp TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS message_receipts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'SENT',
  timestamp TEXT DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id, status)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS pinned_messages (
  chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blocked_users (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, blocked_user_id)
);

-- Polls persist in SQLite so they survive restarts (replacing the
-- previous Redis/in-memory store). Options and votes are normalized:
-- poll_options holds the choice text, poll_votes holds one row per
-- (poll, voter) so a user can change their vote.

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  is_anonymous INTEGER DEFAULT 0,
  is_quiz INTEGER DEFAULT 0,
  correct_option_id TEXT,
  explanation TEXT,
  total_votes INTEGER DEFAULT 0,
  closed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS poll_options (
  id TEXT PRIMARY KEY,
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  UNIQUE(poll_id, position)
);

CREATE TABLE IF NOT EXISTS poll_votes (
  poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_option ON poll_votes(poll_id, option_id);

-- Compound Indices for High-Throughput Queries
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_chat_user ON chat_members(chat_id, user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_lookup ON message_receipts(message_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_lookup ON message_reactions(message_id, user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_lookup ON blocked_users(user_id, blocked_user_id);

-- Durable outbox for store-and-forward delivery (offline caching).
--
-- A row is enqueued when a message must reach a recipient that may be
-- offline; it holds the exact serialized WSFrame to redeliver. The worker in
-- services/outbox.service.ts claims due rows, hands them to a registered
-- transport, retries failures with exponential backoff and jitter, and
-- expires entries that were never delivered within the configured TTL.

CREATE TABLE IF NOT EXISTS outbox_queue (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  temp_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_next ON outbox_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_outbox_recipient_status ON outbox_queue(recipient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_outbox_chat_status ON outbox_queue(chat_id, status);

-- Per-device sync cursor: a reconnecting device catches up from its last
-- acked sequence number instead of silently missing everything that was sent
-- while it was offline.

CREATE TABLE IF NOT EXISTS device_sync_state (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  last_acked_seq INTEGER NOT NULL DEFAULT 0,
  last_delivered_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_sync_user_device ON device_sync_state(user_id, device_id);
