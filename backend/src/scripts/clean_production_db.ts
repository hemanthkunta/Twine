import { db, initDatabase } from '../db/index.js';
import bcrypt from 'bcryptjs';

console.log('🧹 Purging test cruft and restoring pristine production database...');

initDatabase();

// 1. Wipe all test messages, chats, members, and sessions safely
const tablesToClean = [
  'message_receipts',
  'message_reactions',
  'poll_votes',
  'poll_options',
  'polls',
  'messages',
  'chat_members',
  'chats',
  'user_sessions',
  'push_subscriptions'
];

for (const t of tablesToClean) {
  try {
    db.exec(`DELETE FROM ${t};`);
  } catch (err) {
    // Ignore if table does not exist
  }
}

const defaultPasswordHash = bcrypt.hashSync('password123', 12);

// 2. Production Core Demo Profiles (Only 2 Accounts: Alice & Bob)
const productionUsers = [
  {
    id: 'usr_alice_001',
    phone_number: '+12345678901',
    username: 'alice',
    display_name: 'Alice Walker',
    bio: 'Core Platform Lead 🚀 • Twine Messenger',
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
];

// Must be an upsert, NOT "INSERT OR REPLACE": node:sqlite enables PRAGMA
// foreign_keys by default, and REPLACE resolves a conflict by DELETING the
// existing row first. That delete cascades through identity_keys,
// push_subscriptions and other users.id references - silently destroying
// data this script is meant to preserve. ON CONFLICT DO UPDATE refreshes the
// profile fields in place and leaves referential data intact.
const insertUserStmt = db.prepare(`
  INSERT INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash, is_bot)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  ON CONFLICT(id) DO UPDATE SET
    phone_number = excluded.phone_number,
    username = excluded.username,
    display_name = excluded.display_name,
    bio = excluded.bio,
    avatar_url = excluded.avatar_url,
    password_hash = excluded.password_hash,
    is_bot = excluded.is_bot,
    updated_at = datetime('now')
`);

for (const u of productionUsers) {
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

// 3. Pristine Seed Chat: Direct 1:1 Chat (Alice & Bob)
const directChatId = 'chat_alice_bob_101';
db.prepare(`INSERT OR IGNORE INTO chats (id, type, title, is_e2ee) VALUES (?, 'DIRECT', 'Alice & Bob', 0)`).run(directChatId);
db.prepare(`INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES ('cm_101_1', ?, 'usr_alice_001', 'MEMBER')`).run(directChatId);
db.prepare(`INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role) VALUES ('cm_101_2', ?, 'usr_bob_002', 'MEMBER')`).run(directChatId);
db.prepare(`
  INSERT OR IGNORE INTO messages (id, chat_id, sender_id, type, content_text, created_at)
  VALUES ('msg_prod_001', ?, 'usr_bob_002', 'TEXT', 'Hey Alice! Twine messenger is live and running. Real-time WebSockets, WebRTC, and E2EE are ready to test! 🚀', datetime('now', '-5 minutes'))
`).run(directChatId);

console.log('✨ Production database cleaned and seeded successfully! 2 clean accounts ready (Alice & Bob).');

