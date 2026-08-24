import { db, initDatabase } from '../db/index.js';
import bcrypt from 'bcryptjs';

console.log('🧹 Purging test cruft and restoring pristine production database...');

initDatabase();

// 1. Wipe all test messages, chats, members, and sessions safely
const tablesToClean = [
  'message_receipts',
  'message_reactions',
  'poll_votes',
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

const defaultPasswordHash = bcrypt.hashSync('password123', 8);

// 2. Production Core Demo & Team Profiles
const productionUsers = [
  {
    id: 'usr_alice_001',
    phone_number: '+12345678901',
    username: 'alice',
    display_name: 'Alice Walker',
    bio: 'Core Platform Lead 🚀 • Aerogram Engineering',
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
    display_name: 'Charlie Day',
    bio: 'Mobile & WebRTC Media Engineer 🎙️',
    avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
  },
  {
    id: 'usr_diana_004',
    phone_number: '+12345678904',
    username: 'diana',
    display_name: 'Diana Prince',
    bio: 'Design Systems & Security Specialist 🔐',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
  },
  {
    id: 'usr_ai_bot',
    phone_number: '+00000000000',
    username: 'aether_ai',
    display_name: 'Aether AI Copilot',
    bio: 'Intelligent AI Assistant • Real-time summaries, translation & chat intelligence',
    avatar_url: 'https://api.dicebear.com/7.x/bottts/svg?seed=AetherBot',
    is_bot: 1,
  },
];

const insertUserStmt = db.prepare(`
  INSERT OR REPLACE INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash, is_bot)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const u of productionUsers) {
  insertUserStmt.run(
    u.id,
    u.phone_number,
    u.username,
    u.display_name,
    u.bio,
    u.avatar_url,
    defaultPasswordHash,
    u.is_bot ? 1 : 0
  );
}

// 3. Pristine Seed Chat 1: "Saved Messages" (Self Chat for Alice)
const aliceSavedId = 'chat_saved_alice_001';
db.prepare(`INSERT INTO chats (id, type, title, is_e2ee) VALUES (?, 'SAVED', 'Saved Messages', 1)`).run(aliceSavedId);
db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'OWNER')`).run('cm_saved_alice', aliceSavedId, 'usr_alice_001');
db.prepare(`
  INSERT INTO messages (id, chat_id, sender_id, type, content_text, created_at)
  VALUES (?, ?, ?, 'TEXT', ?, datetime('now', '-2 hours'))
`).run(
  'msg_saved_001',
  aliceSavedId,
  'usr_alice_001',
  '🔖 Personal Cloud Notes: Your saved messages, bookmarks, and private links are end-to-end encrypted and synced across all your devices.'
);

// 4. Pristine Seed Chat 2: Direct 1:1 Chat (Alice & Bob)
const directChatId = 'chat_alice_bob_101';
db.prepare(`INSERT INTO chats (id, type, title, is_e2ee) VALUES (?, 'DIRECT', 'Alice & Bob', 0)`).run(directChatId);
db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES ('cm_101_1', ?, 'usr_alice_001', 'MEMBER')`).run(directChatId);
db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES ('cm_101_2', ?, 'usr_bob_002', 'MEMBER')`).run(directChatId);
db.prepare(`
  INSERT INTO messages (id, chat_id, sender_id, type, content_text, created_at)
  VALUES ('msg_prod_001', ?, 'usr_bob_002', 'TEXT', 'Hey Alice! Aerogram is ready for production. Real-time WebSockets and P2P mesh are live 🚀', datetime('now', '-15 minutes'))
`).run(directChatId);

// 5. Pristine Seed Chat 3: Aether AI Copilot (Alice & AI Bot)
const aiChatId = 'chat_alice_ai_102';
db.prepare(`INSERT INTO chats (id, type, title, is_e2ee) VALUES (?, 'DIRECT', 'Aether AI Assistant', 0)`).run(aiChatId);
db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES ('cm_ai_1', ?, 'usr_alice_001', 'MEMBER')`).run(aiChatId);
db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES ('cm_ai_2', ?, 'usr_ai_bot', 'ADMIN')`).run(aiChatId);
db.prepare(`
  INSERT INTO messages (id, chat_id, sender_id, type, content_text, created_at)
  VALUES ('msg_ai_001', ?, 'usr_ai_bot', 'TEXT', '👋 Hello Alice! I am your AI Copilot. Ask me questions, generate smart summaries, or translate chat threads in real time!', datetime('now', '-45 minutes'))
`).run(aiChatId);

// 6. Pristine Seed Chat 4: Supergroup "🚀 Core Engineering & Architecture"
const groupId = 'group_core_eng_201';
db.prepare(`
  INSERT INTO chats (id, type, title, description, avatar_url, creator_id)
  VALUES (?, 'SUPERGROUP', '🚀 Core Engineering & Architecture', 'High-throughput real-time messaging architecture, WebRTC, protocols, and scaling discussions.', 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150', 'usr_alice_001')
`).run(groupId);

const members = [
  { id: 'usr_alice_001', role: 'OWNER' },
  { id: 'usr_bob_002', role: 'ADMIN' },
  { id: 'usr_charlie_003', role: 'MEMBER' },
  { id: 'usr_diana_004', role: 'MEMBER' },
  { id: 'usr_ai_bot', role: 'MEMBER' },
];

for (const m of members) {
  db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, ?)`).run(
    `cm_grp_${m.id}`,
    groupId,
    m.id,
    m.role
  );
}

db.prepare(`
  INSERT INTO messages (id, chat_id, sender_id, type, content_text, created_at)
  VALUES ('msg_grp_001', ?, 'usr_alice_001', 'TEXT', 'Welcome to Core Engineering! 🚀 All systems are production-ready with sub-5ms sync.', datetime('now', '-25 minutes'))
`).run(groupId);

db.prepare(`
  INSERT INTO messages (id, chat_id, sender_id, type, content_text, created_at)
  VALUES ('msg_grp_002', ?, 'usr_bob_002', 'TEXT', 'Confirmed! Multi-device WebSocket gateway and BLE mesh fallback verified.', datetime('now', '-20 minutes'))
`).run(groupId);

// 7. Pristine Seed Chat 5: Broadcast Channel "📢 Aerogram Official News"
const channelId = 'channel_announcements_301';
db.prepare(`
  INSERT INTO chats (id, type, title, description, avatar_url, creator_id)
  VALUES (?, 'CHANNEL', '📢 Aerogram Official News', 'Official announcements, performance benchmarks, and release updates.', 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=150', 'usr_alice_001')
`).run(channelId);

for (const m of members) {
  db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, ?)`).run(
    `cm_chn_${m.id}`,
    channelId,
    m.id,
    m.role === 'OWNER' ? 'OWNER' : 'MEMBER'
  );
}

db.prepare(`
  INSERT INTO messages (id, chat_id, sender_id, type, content_text, created_at)
  VALUES ('msg_chn_001', ?, 'usr_alice_001', 'TEXT', '🎉 Aerogram 2.4 Production Release is live! Features E2EE ECDH/AES-256-GCM, offline mesh Bluetooth fallback, WebRTC calls, AI assistant, and unified Web/Android sync.', datetime('now', '-1 hour'))
`).run(channelId);

console.log('✨ Production database cleaned and seeded successfully! 5 clean chats ready.');
