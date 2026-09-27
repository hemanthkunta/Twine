import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { BaseService } from './base.service.js';
import { Chat, ChatType, UserRole, UserSummary, Message } from '../types/protocol.js';
import { ChatService } from './chat.service.js';
import { MessageService } from './message.service.js';

export class GroupService {
    static async createGroup(params: {
        creatorId: string;
        title: string;
        description?: string;
        avatarUrl?: string;
        type: ChatType; // 'GROUP', 'SUPERGROUP', 'CHANNEL'
        memberIds?: string[];
    }): Promise<Chat> {
        const chatId = `chat_${params.type.toLowerCase()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const avatar =
            params.avatarUrl ||
            `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(params.title)}`;

        BaseService.execute(
            `
      INSERT INTO chats (id, type, title, description, avatar_url, creator_id, is_e2ee)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `,
            [chatId, params.type, params.title, params.description || '', avatar, params.creatorId]
        );

        // Add creator as OWNER
        const cmId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        BaseService.execute(
            `
      INSERT INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, 'OWNER')
    `,
            [cmId, chatId, params.creatorId]
        );

        // Add invited members
        if (params.memberIds && params.memberIds.length > 0) {
            for (const uid of params.memberIds) {
                if (uid !== params.creatorId) {
                    const mId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
                    BaseService.execute(
                        `
            INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
            VALUES (?, ?, ?, 'MEMBER')
          `,
                        [mId, chatId, uid]
                    );
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

        return (await ChatService.getChatById(chatId, params.creatorId))!;
    }

    static async addMember(
        chatId: string,
        userId: string,
        role: UserRole = 'MEMBER'
    ): Promise<Chat> {
        const mId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        BaseService.execute(
            `
      INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `,
            [mId, chatId, userId, role]
        );

        BaseService.execute(`UPDATE chats SET updated_at = datetime('now') WHERE id = ?`, [chatId]);
        return (await ChatService.getChatById(chatId, userId))!;
    }

    static async addMembers(chatId: string, userIds: string[], addedByUserId: string) {
        for (const uid of userIds) {
            const mId = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
            BaseService.execute(
                `
        INSERT OR IGNORE INTO chat_members (id, chat_id, user_id, role)
        VALUES (?, ?, ?, 'MEMBER')
      `,
                [mId, chatId, uid]
            );
        }

        BaseService.execute(`UPDATE chats SET updated_at = datetime('now') WHERE id = ?`, [chatId]);
    }

    static removeMember(chatId: string, userId: string) {
        BaseService.execute(`DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?`, [
            chatId,
            userId,
        ]);
    }

    static pinMessage(chatId: string, messageId: string, pinnedByUserId: string) {
        BaseService.execute(
            `
      INSERT INTO pinned_messages (chat_id, message_id, pinned_by, created_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(chat_id) DO UPDATE SET message_id = excluded.message_id, pinned_by = excluded.pinned_by, created_at = datetime('now')
    `,
            [chatId, messageId, pinnedByUserId]
        );

        BaseService.execute(`UPDATE messages SET is_pinned = 1 WHERE id = ?`, [messageId]);
    }

    static unpinMessage(chatId: string) {
        BaseService.execute(`DELETE FROM pinned_messages WHERE chat_id = ?`, [chatId]);
    }

    static async getPinnedMessage(chatId: string): Promise<Message | null> {
        const row = BaseService.queryOne<{ message_id: string }>(
            `SELECT message_id FROM pinned_messages WHERE chat_id = ?`,
            [chatId]
        );
        if (!row) return null;
        return await MessageService.getMessageById(row.message_id);
    }
}
