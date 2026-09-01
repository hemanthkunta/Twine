// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';

// Ensure data directory exists
const dbDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new DatabaseSync(config.dbPath);

// High-Throughput SQLite Pragmas for concurrency and crash-durability
try {
    db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 10000;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -64000;
    PRAGMA temp_store = MEMORY;
  `);
} catch (err) {
    console.warn('Pragma tuning warning:', err);
}

export function checkDbHealth(): boolean {
    try {
        const res = db.prepare('SELECT 1 as healthy').get() as { healthy: number };
        return res && res.healthy === 1;
    } catch {
        return false;
    }
}

export function initDatabase() {
    db.exec(`
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
        chain_key_hex TEXT NOT NULL,
        iteration INTEGER NOT NULL DEFAULT 0,
        signing_pub_key_hex TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(chat_id, sender_id)
    );

    CREATE INDEX IF NOT EXISTS idx_group_sender_keys_chat ON group_sender_keys(chat_id);


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

    -- Compound Indices for High-Throughput Queries
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_members_chat_user ON chat_members(chat_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_lookup ON message_receipts(message_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_reactions_lookup ON message_reactions(message_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_blocked_users_lookup ON blocked_users(user_id, blocked_user_id);

  `);

    // Run migrations on existing databases safely
    try {
        db.exec('ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0');
    } catch {}
    try {
        db.exec('ALTER TABLE messages ADD COLUMN is_pinned INTEGER DEFAULT 0');
    } catch {}
    try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS blocked_users (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, blocked_user_id)
          );
        `);
    } catch {}

    seedInitialData();
}

function seedInitialData() {
    const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const defaultPasswordHash = bcrypt.hashSync('password123', 8);

    // 1. Seed Bot if not exists
    const aiBot = db.prepare('SELECT id FROM users WHERE id = ?').get('usr_ai_bot') as any;
    if (!aiBot) {
        db.prepare(
            `
      INSERT INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash, is_bot)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `
        ).run(
            'usr_ai_bot',
            '+00000000000',
            'aether_ai',
            'Aether AI Assistant 🤖',
            'Your built-in AI copilot for summaries, translations, smart replies, and instant search.',
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
            defaultPasswordHash
        );
    }

    const demoUsers = [
        {
            id: 'usr_alice_001',
            phone_number: '+12345678901',
            username: 'alice',
            display_name: 'Alice Walker',
            bio: 'Exploring real-time protocols & cryptography 🔐',
            avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        },
        {
            id: 'usr_bob_002',
            phone_number: '+12345678902',
            username: 'bob',
            display_name: 'Bob Vance',
            bio: 'Distributed Systems & P2P Mesh Architect ⚡',
            avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        },
        {
            id: 'usr_charlie_003',
            phone_number: '+12345678903',
            username: 'charlie',
            display_name: 'Charlie Smith',
            bio: 'Security Researcher & Cryptanalyst 🛡️',
            avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
        },
        {
            id: 'usr_diana_004',
            phone_number: '+12345678904',
            username: 'diana',
            display_name: 'Diana Prince',
            bio: 'Mobile App Lead & UX Specialist 📱',
            avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
        },
    ];

    const insertUserStmt = db.prepare(`
    INSERT OR REPLACE INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

    for (const u of demoUsers) {
        insertUserStmt.run(
            u.id,
            u.phone_number,
            u.username,
            u.display_name,
            u.bio,
            u.avatar_url,
            defaultPasswordHash
        );
    }

    // 2. Pre-seed Direct Chat (Alice & Bob)
    const directChatId = 'chat_alice_bob_101';
    db.prepare(
        `INSERT OR IGNORE INTO chats (id, type, title, is_e2ee) VALUES (?, 'DIRECT', ?, 0)`
    ).run(directChatId, 'Alice & Bob');
    db.prepare(
        `INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`
    ).run('cm_101_1', directChatId, 'usr_alice_001');
    db.prepare(
        `INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`
    ).run('cm_101_2', directChatId, 'usr_bob_002');

    db.prepare(
        `
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
    VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-5 minutes'))
  `
    ).run(
        'msg_alice_bob_001',
        directChatId,
        'usr_bob_002',
        'Hey Alice! Twine messenger is live and running. Real-time WebSockets, WebRTC, and E2EE are ready to test! 🚀'
    );

    console.log('✅ Seeding complete: 2 accounts ready (Alice & Bob).');
}
