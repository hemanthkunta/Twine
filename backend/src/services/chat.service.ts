import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { BaseService } from './base.service.js';
import { Chat, ChatMember, UserSummary, ChatType } from '../types/protocol.js';
import { MessageService } from './message.service.js';
import { SignalProtocolService } from './signalProtocol.service.js';

export class ChatService {
    /**
     * Predicate that hides messages a member has cleared from their own view.
     *
     * "Clear history" is per-user: it stamps `chat_members.cleared_at` and only
     * hides earlier messages from that member, leaving every other member's copy
     * untouched. Bind one `?` for the member's user id; alias messages as `m`.
     */
    static readonly NOT_CLEARED_PREDICATE = `m.created_at > COALESCE((SELECT cm.cleared_at FROM chat_members cm WHERE cm.chat_id = m.chat_id AND cm.user_id = ?), '')`;

    static async getOrCreateDirectChat(userAId: string, userBId: string): Promise<Chat> {
        if (userAId === userBId) {
            throw new Error('Cannot start a direct chat with yourself');
        }

        const existing = BaseService.queryOne<{
            id: string;
            type: string;
            created_at: string;
            updated_at: string;
            is_e2ee: number;
        }>(
            `
      SELECT c.id, c.type, c.created_at, c.updated_at, c.is_e2ee
      FROM chats c
      JOIN chat_members cm1 ON c.id = cm1.chat_id AND cm1.user_id = ?
      JOIN chat_members cm2 ON c.id = cm2.chat_id AND cm2.user_id = ?
      WHERE c.type = 'DIRECT'
    `,
            [userAId, userBId]
        );

        if (existing) {
            return (await this.getChatById(existing.id, userAId))!;
        }

        const chatId = `chat_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        BaseService.execute(
            `
      INSERT INTO chats (id, type, is_e2ee)
      VALUES (?, 'DIRECT', 1)
    `,
            [chatId]
        );

        const cm1 = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const cm2 = `cm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

        BaseService.execute(
            `INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`,
            [cm1, chatId, userAId]
        );
        BaseService.execute(
            `INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`,
            [cm2, chatId, userBId]
        );

        return (await this.getChatById(chatId, userAId))!;
    }

    static async getChatById(chatId: string, userId: string): Promise<Chat | null> {
        const row = BaseService.queryOne<{
            id: string;
            type: string;
            title: string | null;
            description: string | null;
            avatar_url: string | null;
            creator_id: string | null;
            is_e2ee: number;
            created_at: string;
            updated_at: string;
        }>(`SELECT * FROM chats WHERE id = ?`, [chatId]);
        if (!row) return null;

        let peerUser: UserSummary | undefined = undefined;
        if (row.type === 'DIRECT') {
            const peerRow = BaseService.queryOne<{
                id: string;
                username: string;
                display_name: string;
                avatar_url: string;
                last_seen_at: string;
                is_bot: number;
            }>(
                `
        SELECT u.id, u.username, u.display_name, u.avatar_url, u.last_seen_at, u.is_bot
        FROM chat_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.chat_id = ? AND cm.user_id != ?
      `,
                [chatId, userId]
            );

            if (peerRow) {
                peerUser = {
                    id: peerRow.id,
                    username: peerRow.username!,
                    display_name: peerRow.display_name!,
                    avatar_url: peerRow.avatar_url,
                    last_seen_at: peerRow.last_seen_at,
                    is_bot: Boolean(peerRow.is_bot),
                };
            }
        }

        // Member count
        const memberCountRow = BaseService.queryOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM chat_members WHERE chat_id = ?',
            [chatId]
        );

        // Last message
        const lastMsgRow = BaseService.queryOne<{ id: string }>(
            `
      SELECT m.id FROM messages m
      WHERE m.chat_id = ? AND m.is_deleted = 0
        AND ${ChatService.NOT_CLEARED_PREDICATE}
      ORDER BY m.created_at DESC LIMIT 1
    `,
            [chatId, userId]
        ) as { id: string } | undefined;

        const lastMessage = lastMsgRow
            ? ((await MessageService.getMessageById(lastMsgRow.id)) ?? undefined)
            : undefined;

        // Unread count
        const unreadRow = BaseService.queryOne<{ count: number }>(
            `
      SELECT COUNT(*) as count FROM messages m
      WHERE m.chat_id = ? AND m.sender_id != ? AND m.is_deleted = 0
      AND ${ChatService.NOT_CLEARED_PREDICATE}
      AND NOT EXISTS (
        SELECT 1 FROM message_receipts mr
        WHERE mr.message_id = m.id AND mr.user_id = ? AND mr.status = 'READ'
      )
    `,
            [chatId, userId, userId, userId]
        );

        // Pinned message
        const pinRow = BaseService.queryOne<{ message_id: string }>(
            `SELECT message_id FROM pinned_messages WHERE chat_id = ?`,
            [chatId]
        );
        const pinnedMessage = pinRow
            ? ((await MessageService.getMessageById(pinRow.message_id)) ?? undefined)
            : undefined;

        // Whether this member has muted notifications for the chat
        const muteRow = BaseService.queryOne<{ is_muted: number }>(
            `SELECT is_muted FROM chat_members WHERE chat_id = ? AND user_id = ?`,
            [chatId, userId]
        );

        return {
            id: row.id,
            type: row.type as ChatType,
            title:
                row.type === 'DIRECT' && peerUser
                    ? peerUser.display_name
                    : (row.title ?? undefined),
            description: row.description ?? undefined,
            avatar_url:
                row.type === 'DIRECT' && peerUser
                    ? peerUser.avatar_url
                    : (row.avatar_url ?? undefined),
            creator_id: row.creator_id ?? undefined,
            is_e2ee: Boolean(row.is_e2ee),
            member_count: memberCountRow ? memberCountRow.count : 1,
            created_at: row.created_at,
            updated_at: row.updated_at,
            peer_user: peerUser,
            last_message: lastMessage,
            pinned_message: pinnedMessage,
            unread_count: unreadRow ? unreadRow.count : 0,
            is_muted: Boolean(muteRow?.is_muted),
            // `row.type`, `row.is_e2ee` and `peerUser` are already resolved above, so the
            // safety number is computed from those. Previously this called
            // getSafetyNumber(), which called getChatById() again: the resulting
            // unbounded recursion starved the microtask queue and hung every chat load.
            safety_number:
                (await this.calculateSafetyNumber(
                    userId,
                    row.type,
                    Boolean(row.is_e2ee),
                    peerUser?.id
                )) ?? undefined,
        };
    }

    static async getOrCreateSavedMessagesChat(userId: string): Promise<Chat> {
        const existing = BaseService.queryOne<{ id: string }>(
            `
              SELECT c.id FROM chats c
              JOIN chat_members cm ON c.id = cm.chat_id
              WHERE c.type = 'SAVED' AND cm.user_id = ?
            `,
            [userId]
        );

        if (existing) {
            return (await this.getChatById(existing.id, userId))!;
        }

        const chatId = `saved_${userId}`;
        BaseService.execute(
            `
      INSERT OR REPLACE INTO chats (id, type, title, description, is_e2ee)
      VALUES (?, 'SAVED', 'Saved Messages', 'Personal cloud storage & notes', 1)
    `,
            [chatId]
        );

        BaseService.execute(
            `
      INSERT OR REPLACE INTO chat_members (id, chat_id, user_id, role)
      VALUES (?, ?, ?, 'OWNER')
    `,
            [`cm_saved_${userId}`, chatId, userId]
        );

        return (await this.getChatById(chatId, userId))!;
    }

    static async getUserChats(userId: string): Promise<Chat[]> {
        // Ensure Saved Messages chat exists
        await this.getOrCreateSavedMessagesChat(userId);

        const rows = BaseService.query<{ id: string }>(
            `
      SELECT c.id
      FROM chats c
      JOIN chat_members cm ON c.id = cm.chat_id
      WHERE cm.user_id = ?
      ORDER BY (c.type = 'SAVED') DESC, c.updated_at DESC
    `,
            [userId]
        );

        const chats = [];
        for (const r of rows) {
            const chat = await this.getChatById(r.id, userId);
            if (chat) {
                if (chat.type === 'SAVED') {
                    chat.is_saved_messages = true;
                }
                chats.push(chat);
            }
        }
        return chats;
    }

    static getChatMemberIds(chatId: string): string[] {
        const rows = BaseService.query<{ user_id: string }>(
            `
              SELECT user_id FROM chat_members WHERE chat_id = ?
            `,
            [chatId]
        );
        return rows.map((r) => r.user_id);
    }

    /**
     * Check if a chat is configured for end-to-end encryption
     */
    static async isChatE2EE(chatId: string): Promise<boolean> {
        const row = BaseService.queryOne<{ is_e2ee: number }>(
            'SELECT is_e2ee FROM chats WHERE id = ?',
            [chatId]
        );
        return row ? Boolean(row.is_e2ee) : false;
    }

    static isChatMember(chatId: string, userId: string): boolean {
        const row = BaseService.queryOne<{ 1: number }>(
            `
                SELECT 1
                FROM chat_members
                WHERE chat_id = ?
                    AND user_id = ?
                LIMIT 1
            `,
            [chatId, userId]
        );

        return Boolean(row);
    }

    /**
     * Get the safety number for E2EE verification in a direct chat
     * @param chatId The chat ID
     * @param userId The current user's ID (to identify which peer to calculate with)
     * @returns Safety number string or null if not a direct chat or E2EE not enabled
     */
    static async getSafetyNumber(chatId: string, userId: string): Promise<string | null> {
        // Resolve the chat shape with a direct query instead of getChatById(): that
        // call already computes the safety number, so delegating to it created a
        // cycle (getChatById -> getSafetyNumber -> getChatById) that never settled.
        const chatRow = BaseService.queryOne<{ type: string; is_e2ee: number }>(
            `SELECT type, is_e2ee FROM chats WHERE id = ?`,
            [chatId]
        );
        if (!chatRow) {
            return null;
        }

        const peerUserId = this.getChatMemberIds(chatId).find((id) => id !== userId);
        return this.calculateSafetyNumber(
            userId,
            chatRow.type,
            Boolean(chatRow.is_e2ee),
            peerUserId
        );
    }

    /**
     * Shared safety-number computation for a direct chat.
     *
     * Deliberately takes the already-known chat shape as arguments and never calls
     * getChatById(), so it is safe to invoke from getChatById() itself. Returns null
     * for any chat that is not a 1:1 E2EE chat, or when the peer's identity key
     * cannot be resolved.
     */
    private static async calculateSafetyNumber(
        userId: string,
        chatType: string,
        isE2EE: boolean,
        peerUserId?: string
    ): Promise<string | null> {
        if (chatType !== 'DIRECT' || !isE2EE || !peerUserId) {
            return null;
        }

        try {
            return await SignalProtocolService.calculateSafetyNumber(userId, peerUserId);
        } catch (error) {
            console.warn('Failed to calculate safety number for chat:', error);
            return null;
        }
    }

    static getChatMembers(chatId: string): ChatMember[] {
        const rows = BaseService.query(
            `
      SELECT cm.*, u.username, u.display_name, u.avatar_url, u.is_bot
      FROM chat_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.chat_id = ?
    `,
            [chatId]
        ) as any[];

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

    static async isAllowedToSend(chatId: string, userId: string): Promise<boolean> {
        const chatRow = BaseService.queryOne<{ type: string }>(
            `SELECT type FROM chats WHERE id = ?`,
            [chatId]
        );
        if (!chatRow) return false;

        const memberRow = BaseService.queryOne<{ role: string }>(
            `SELECT role FROM chat_members WHERE chat_id = ? AND user_id = ?`,
            [chatId, userId]
        );
        if (!memberRow) return false;

        if (chatRow.type !== 'CHANNEL') {
            return true;
        }

        return memberRow.role === 'OWNER' || memberRow.role === 'ADMIN';
    }
}
