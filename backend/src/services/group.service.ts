import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { Chat, ChatType, UserRole, UserSummary, Message } from '../types/protocol.js';
import { ChatService } from './chat.service.js';
import { MessageService } from './message.service.js';

export class GroupService {
  static createGroup(params: {
    creatorId: string;
    title: string;
    description?: string;
    avatarUrl?: string;
    type: ChatType; // 'GROUP', 'SUPERGROUP', 'CHANNEL'
    memberIds?: string[];
  }): Chat {
    const chatId = `chat_${params.type.toLowerCase()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const avatar =
      params.avatarUrl ||
      `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(params.title)}`;

    db.prepare(`
      INSERT INTO chats (id, type, title, description, avatar_url, creator_id, is_e2ee)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(
      chatId,
      params.type,
      params.title,
      params.description || '',
      avatar,
      params.creatorId
    );

    // Add creator as OWNER
    const cmId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.prepare(`
      INSERT INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, 'OWNER')
    `).run(cmId, chatId, params.creatorId);

    // Add invited members
    if (params.memberIds && params.memberIds.length > 0) {
      const insertMember = db.prepare(`
        INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
        VALUES (?, ?, ?, 'MEMBER')
      `);

      for (const uid of params.memberIds) {
        if (uid !== params.creatorId) {
          const mId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
          insertMember.run(mId, chatId, uid);
        }
      }
    }

    // System greeting message
    MessageService.createMessage({
      chatId,
      senderId: params.creatorId,
      contentText: `${params.type === 'CHANNEL' ? 'Channel' : 'Group'} "${params.title}" created.`,
      type: 'SYSTEM',
    });

    return ChatService.getChatById(chatId, params.creatorId)!;
  }

  static addMember(chatId: string, userId: string, role: UserRole = 'MEMBER'): Chat {
    const mId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.prepare(`
      INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(mId, chatId, userId, role);

    db.prepare(`UPDATE chats SET updated_at = datetime('now') WHERE id = ?`).run(chatId);
    return ChatService.getChatById(chatId, userId)!;
  }

  static addMembers(chatId: string, userIds: string[], addedByUserId: string) {
    const insertMember = db.prepare(`
      INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, 'MEMBER')
    `);

    for (const uid of userIds) {
      const mId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      insertMember.run(mId, chatId, uid);
    }

    db.prepare(`UPDATE chats SET updated_at = datetime('now') WHERE id = ?`).run(chatId);
  }

  static removeMember(chatId: string, userId: string) {
    db.prepare(`DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?`).run(chatId, userId);
  }

  static pinMessage(chatId: string, messageId: string, pinnedByUserId: string) {
    db.prepare(`
      INSERT INTO pinned_messages (chat_id, message_id, pinned_by, created_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(chat_id) DO UPDATE SET message_id = excluded.message_id, pinned_by = excluded.pinned_by, created_at = datetime('now')
    `).run(chatId, messageId, pinnedByUserId);

    db.prepare(`UPDATE messages SET is_pinned = 1 WHERE id = ?`).run(messageId);
  }

  static unpinMessage(chatId: string) {
    db.prepare(`DELETE FROM pinned_messages WHERE chat_id = ?`).run(chatId);
  }

  static getPinnedMessage(chatId: string): Message | null {
    const row = db.prepare(`SELECT message_id FROM pinned_messages WHERE chat_id = ?`).get(chatId) as { message_id: string } | undefined;
    if (!row) return null;
    return MessageService.getMessageById(row.message_id);
  }
}
