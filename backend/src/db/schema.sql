-- PostgreSQL Production Schema for Messaging Platform

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone_number TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    display_name TEXT NOT NULL,
    bio TEXT DEFAULT '',
    avatar_url TEXT,
    password_hash TEXT,
    is_2fa_enabled INTEGER DEFAULT 0,
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
    is_edited INTEGER DEFAULT 0,
    edit_timestamp TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS message_receipts (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'SENT',
    timestamp TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, user_id, status)
);
