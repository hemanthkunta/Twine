import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { Chat, ChatMember, UserSummary } from '../types/protocol.js';
import { MessageService } from './message.service.js';

export class ChatService {
  static getOrCreateDirectChat(userAId: string, userBId: string): Chat {
    if (userAId === userBId) {
      throw new Error('Cannot start a direct chat with yourself');
    }

    const existing = db.prepare(`
      SELECT c.id, c.type, c.created_at, c.updated_at, c.is_e2ee
      FROM chats c
      JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = ?
      JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = ?
      WHERE c.type = 'DIRECT'
    `).get(userAId, userBId) as any;

    if (existing) {
      return this.getChatById(existing.id, userAId)!;
    }

    const chatId = `chat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.prepare(`
      INSERT INTO chats (id, type, is_e2ee)
      VALUES (?, 'DIRECT', 0)
    `).run(chatId);

    const cm1 = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const cm2 = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`).run(
      cm1,
      chatId,
      userAId
    );
    db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`).run(
      cm2,
      chatId,
      userBId
    );

    return this.getChatById(chatId, userAId)!;
  }

  static getChatById(chatId: string, userId: string): Chat | null {
    const row = db.prepare(`SELECT * FROM chats WHERE id = ?`).get(chatId) as any;
    if (!row) return null;

    let peerUser: UserSummary | undefined = undefined;
    if (row.type === 'DIRECT') {
      const peerRow = db.prepare(`
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.last_seen_at, u.is_bot
        FROM chat_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.chat_id = ? AND cm.user_id != ?
      `).get(chatId, userId) as any;

      if (peerRow) {
        peerUser = {
          id: peerRow.id,
          username: peerRow.username,
          display_name: peerRow.display_name,
          avatar_url: peerRow.avatar_url,
          last_seen_at: peerRow.last_seen_at,
          is_bot: Boolean(peerRow.is_bot),
        };
      }
    }

    // Member count
    const memberCountRow = db.prepare('SELECT COUNT(*) as count FROM chat_members WHERE chat_id = ?').get(chatId) as { count: number };

    // Last message
    const lastMsgRow = db.prepare(`
      SELECT id FROM messages WHERE chat_id = ? AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1
    `).get(chatId) as { id: string } | undefined;

    const lastMessage = lastMsgRow ? MessageService.getMessageById(lastMsgRow.id) || undefined : undefined;

    // Unread count
    const unreadRow = db.prepare(`
      SELECT COUNT(*) as count FROM messages m
      WHERE m.chat_id = ? AND m.sender_id != ? AND m.is_deleted = 0
      AND NOT EXISTS (
        SELECT 1 FROM message_receipts mr 
        WHERE mr.message_id = m.id AND mr.user_id = ? AND mr.status = 'READ'
      )
    `).get(chatId, userId, userId) as { count: number } | undefined;

    // Pinned message
    const pinRow = db.prepare(`SELECT message_id FROM pinned_messages WHERE chat_id = ?`).get(chatId) as { message_id: string } | undefined;
    const pinnedMessage = pinRow ? MessageService.getMessageById(pinRow.message_id) || undefined : undefined;

    return {
      id: row.id,
      type: row.type,
      title: row.type === 'DIRECT' && peerUser ? peerUser.display_name : row.title,
      description: row.description,
      avatar_url: row.type === 'DIRECT' && peerUser ? peerUser.avatar_url : row.avatar_url,
      creator_id: row.creator_id,
      is_e2ee: Boolean(row.is_e2ee),
      member_count: memberCountRow ? memberCountRow.count : 1,
      created_at: row.created_at,
      updated_at: row.updated_at,
      peer_user: peerUser,
      last_message: lastMessage,
      pinned_message: pinnedMessage,
      unread_count: unreadRow ? unreadRow.count : 0,
    };
  }

  static getOrCreateSavedMessagesChat(userId: string): Chat {
    const existing = db.prepare(`
      SELECT c.id FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      WHERE c.type = 'SAVED' AND cm.user_id = ?
    `).get(userId) as any;

    if (existing) {
      return this.getChatById(existing.id, userId)!;
    }

    const chatId = `saved_${userId}`;
    db.prepare(`
      INSERT OR REPLACE INTO chats (id, type, title, description, is_e2ee)
      VALUES (?, 'SAVED', 'Saved Messages', 'Personal cloud storage & notes', 1)
    `).run(chatId);

    db.prepare(`
      INSERT OR REPLACE INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, 'OWNER')
    `).run(`cm_saved_${userId}`, chatId, userId);

    return this.getChatById(chatId, userId)!;
  }

  static getUserChats(userId: string): Chat[] {
    // Ensure Saved Messages chat exists
    this.getOrCreateSavedMessagesChat(userId);

    const rows = db.prepare(`
      SELECT c.id
      FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      WHERE cm.user_id = ?
      ORDER BY (c.type = 'SAVED') DESC, c.updated_at DESC
    `).all(userId) as { id: string }[];

    return rows.map((r) => {
      const chat = this.getChatById(r.id, userId)!;
      if (chat && chat.type === 'SAVED') {
        chat.is_saved_messages = true;
      }
      return chat;
    }).filter(Boolean);
  }

  static getChatMemberIds(chatId: string): string[] {
    const rows = db.prepare(`
      SELECT user_id FROM chat_members WHERE chat_id = ?
    `).all(chatId) as { user_id: string }[];
    return rows.map((r) => r.user_id);
  }

  static getChatMembers(chatId: string): ChatMember[] {
    const rows = db.prepare(`
      SELECT cm.*, u.username, u.display_name, u.avatar_url, u.is_bot
      FROM chat_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.chat_id = ?
    `).all(chatId) as any[];

    return rows.map((r) => ({
      id: r.id,
      chat_id: r.chat_id,
      user_id: r.user_id,
      role: r.role,
      last_read_message_id: r.last_read_message_id,
      unread_count: r.unread_count,
      is_muted: Boolean(r.is_muted),
      joined_at: r.joined_at,
      user: {
        id: r.user_id,
        username: r.username,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
        is_bot: Boolean(r.is_bot),
      },
    }));
  }
}
