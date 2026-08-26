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

    -- Compound Indices for High-Throughput Queries
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_members_chat_user ON chat_members(chat_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_lookup ON message_receipts(message_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_reactions_lookup ON message_reactions(message_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON push_subscriptions(user_id);

  `);

    // Run migrations on existing databases safely
    try {
        db.exec('ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0');
    } catch {}
    try {
        db.exec('ALTER TABLE messages ADD COLUMN is_pinned INTEGER DEFAULT 0');
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

    if (countRow && countRow.count > 1) {
        return;
    }

    console.log('🌱 Seeding complete demo users, groups, channels, and conversations...');

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
            bio: 'Refrigeration & Distributed systems enthusiast ⚡',
            avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        },
        {
            id: 'usr_charlie_003',
            phone_number: '+12345678903',
            username: 'charlie',
            display_name: 'Charlie Day',
            bio: 'Building next-gen decentralized networks 🚀',
            avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
        },
        {
            id: 'usr_diana_004',
            phone_number: '+12345678904',
            username: 'diana',
            display_name: 'Diana Prince',
            bio: 'Full stack engineer & UI craftsman ✨',
            avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        },
    ];

    const insertUserStmt = db.prepare(`
    INSERT OR IGNORE INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash)
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

    // 3. Pre-seed Direct Chat with AI Assistant (Alice & AI Bot)
    const aiChatId = 'chat_alice_ai_102';
    db.prepare(
        `INSERT OR IGNORE INTO chats (id, type, title, is_e2ee) VALUES (?, 'DIRECT', ?, 0)`
    ).run(aiChatId, 'Aether AI Assistant');
    db.prepare(
        `INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`
    ).run('cm_ai_1', aiChatId, 'usr_alice_001');
    db.prepare(
        `INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'ADMIN')`
    ).run('cm_ai_2', aiChatId, 'usr_ai_bot');
    db.prepare(
        `
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
    VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-30 minutes'))
  `
    ).run(
        'msg_ai_001',
        aiChatId,
        'usr_ai_bot',
        '👋 Hello Alice! I am your AI Copilot. Ask me anything, request summaries of chats, or translate messages into any language!'
    );

    // 4. Pre-seed Supergroup: "🚀 Core Engineering & Architecture"
    const groupId = 'group_core_eng_201';
    db.prepare(
        `
    INSERT OR IGNORE INTO chats (id, type, title, description, avatar_url, creator_id)
    VALUES (?, 'SUPERGROUP', ?, ?, ?, ?)
  `
    ).run(
        groupId,
        '🚀 Core Engineering & Architecture',
        'High-throughput real-time messaging architecture, WebRTC, protocols, and scaling discussions.',
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150',
        'usr_alice_001'
    );

    // Add all demo users + AI bot to the group
    const members = [
        { id: 'usr_alice_001', role: 'OWNER' },
        { id: 'usr_bob_002', role: 'ADMIN' },
        { id: 'usr_charlie_003', role: 'MEMBER' },
        { id: 'usr_diana_004', role: 'MEMBER' },
        { id: 'usr_ai_bot', role: 'MEMBER' },
    ];
    for (const m of members) {
        db.prepare(
            `
      INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `
        ).run(`cm_grp_${m.id}`, groupId, m.id, m.role);
    }

    // Seed sample group messages
    db.prepare(
        `
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
    VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-20 minutes'))
  `
    ).run(
        'msg_grp_001',
        groupId,
        'usr_alice_001',
        'Welcome to the Core Engineering supergroup! 🚀 We are deploying our WebSockets and WebRTC engine.'
    );

    db.prepare(
        `
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
    VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-18 minutes'))
  `
    ).run(
        'msg_grp_002',
        groupId,
        'usr_bob_002',
        'The multi-device sync and presence latency tests are looking stellar! Under 15ms fanout.'
    );

    db.prepare(
        `
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
    VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-15 minutes'))
  `
    ).run(
        'msg_grp_003',
        groupId,
        'usr_charlie_003',
        'I added support for voice notes with live audio waveforms 🎙️'
    );

    // 5. Pre-seed Broadcast Channel: "📢 Aether Platform Releases & News"
    const channelId = 'channel_announcements_301';
    db.prepare(
        `
    INSERT OR IGNORE INTO chats (id, type, title, description, avatar_url, creator_id)
    VALUES (?, 'CHANNEL', ?, ?, ?, ?)
  `
    ).run(
        channelId,
        '📢 Aether Releases & News',
        'Official broadcast channel for new platform features, encryption updates, and performance milestones.',
        'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=150',
        'usr_alice_001'
    );

    for (const m of members) {
        db.prepare(
            `
      INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `
        ).run(`cm_chn_${m.id}`, channelId, m.id, m.role === 'OWNER' ? 'OWNER' : 'MEMBER');
    }

    db.prepare(
        `
    INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
    VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-1 hour'))
  `
    ).run(
        'msg_chn_001',
        channelId,
        'usr_alice_001',
        '🎉 Aether 2.0 is officially released! Features: WebSockets ⚡, Voice Notes 🎙️, WebRTC Video Calling 📹, AI Summaries ✨, and Groups/Channels 👥!'
    );

    console.log('✅ Seeding complete.');
}
