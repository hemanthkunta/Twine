import crypto from 'node:crypto';
import { BaseService } from './base.service.js';
import { ChatService } from './chat.service.js';
import { MessageService } from './message.service.js';
import { PresenceService } from './presence.service.js';
import { MessageType } from '../types/protocol.js';

export interface ScheduledMessageRow {
    id: string;
    chat_id: string;
    sender_id: string;
    reply_to_message_id: string | null;
    content_text: string;
    type: string;
    media_url: string | null;
    media_metadata: string | null;
    scheduled_at: string;
    sent_message_id: string | null;
    created_at: string;
}

/** How far ahead a message may be scheduled (1 year). */
const MAX_SCHEDULE_HORIZON_MS = 365 * 24 * 60 * 60 * 1000;
/** Pending scheduled messages allowed per user per chat. */
const MAX_PENDING_PER_CHAT = 100;

export class ScheduledMessageService {
    /**
     * Queue a message for future delivery. Delivery happens through the normal
     * send path (MessageService.createMessage + chat:new_message fanout) when
     * the server-side sweep sees scheduled_at pass.
     */
    static create(params: {
        chatId: string;
        senderId: string;
        contentText: string;
        type?: MessageType;
        replyToMessageId?: string;
        mediaUrl?: string;
        mediaMetadata?: Record<string, unknown>;
        scheduledAt: Date;
    }): ScheduledMessageRow {
        if (!ChatService.isChatMember(params.chatId, params.senderId)) {
            throw new Error('You are not a member of this chat');
        }
        if (!params.contentText || params.contentText.length > 10000) {
            throw new Error('Message text must be 1-10000 characters');
        }
        const now = Date.now();
        if (!(params.scheduledAt instanceof Date) || isNaN(params.scheduledAt.getTime())) {
            throw new Error('scheduledAt must be a valid date');
        }
        if (params.scheduledAt.getTime() <= now) {
            throw new Error('scheduledAt must be in the future');
        }
        if (params.scheduledAt.getTime() > now + MAX_SCHEDULE_HORIZON_MS) {
            throw new Error('Messages cannot be scheduled more than a year ahead');
        }

        const pending = BaseService.queryOne<{ count: number }>(
            `SELECT COUNT(*) as count FROM scheduled_messages
             WHERE chat_id = ? AND sender_id = ? AND sent_message_id IS NULL`,
            [params.chatId, params.senderId]
        );
        if ((pending?.count ?? 0) >= MAX_PENDING_PER_CHAT) {
            throw new Error(`At most ${MAX_PENDING_PER_CHAT} pending scheduled messages per chat`);
        }

        const id = `sched_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        const scheduledAtIso = params.scheduledAt.toISOString().replace('T', ' ').slice(0, 19);
        BaseService.execute(
            `INSERT INTO scheduled_messages
               (id, chat_id, sender_id, reply_to_message_id, content_text, type, media_url, media_metadata, scheduled_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                params.chatId,
                params.senderId,
                params.replyToMessageId || null,
                params.contentText,
                params.type || 'TEXT',
                params.mediaUrl || null,
                params.mediaMetadata ? JSON.stringify(params.mediaMetadata) : null,
                scheduledAtIso,
            ]
        );
        return BaseService.queryOne<ScheduledMessageRow>(
            'SELECT * FROM scheduled_messages WHERE id = ?',
            [id]
        )!;
    }

    /** The caller's pending (unsent) scheduled messages in a chat. */
    static listPending(chatId: string, userId: string): ScheduledMessageRow[] {
        if (!ChatService.isChatMember(chatId, userId)) {
            throw new Error('You are not a member of this chat');
        }
        return BaseService.query<ScheduledMessageRow>(
            `SELECT * FROM scheduled_messages
             WHERE chat_id = ? AND sender_id = ? AND sent_message_id IS NULL
             ORDER BY scheduled_at ASC`,
            [chatId, userId]
        );
    }

    /** Cancel a not-yet-sent scheduled message the caller owns. */
    static cancel(id: string, userId: string): void {
        const row = BaseService.queryOne<ScheduledMessageRow>(
            'SELECT * FROM scheduled_messages WHERE id = ?',
            [id]
        );
        if (!row) {
            throw new Error('Scheduled message not found');
        }
        if (row.sender_id !== userId) {
            throw new Error('Not authorized to cancel this scheduled message');
        }
        if (row.sent_message_id) {
            throw new Error('Message has already been sent');
        }
        BaseService.execute('DELETE FROM scheduled_messages WHERE id = ?', [id]);
    }

    /**
     * Dispatch every scheduled message whose time has come. Called by the
     * sweep interval started in server.ts. Each dispatch goes through the
     * normal send path so receipts, search indexing and fanout behave exactly
     * like a live send.
     */
    static async dispatchDue(): Promise<number> {
        const due = BaseService.query<ScheduledMessageRow>(
            `SELECT * FROM scheduled_messages
             WHERE sent_message_id IS NULL AND scheduled_at <= datetime('now')
             ORDER BY scheduled_at ASC
             LIMIT 50`,
            []
        );

        let dispatched = 0;
        for (const row of due) {
            try {
                // Sender may have left the chat since scheduling.
                if (!ChatService.isChatMember(row.chat_id, row.sender_id)) {
                    BaseService.execute('DELETE FROM scheduled_messages WHERE id = ?', [row.id]);
                    continue;
                }

                const msg = await MessageService.createMessage({
                    chatId: row.chat_id,
                    senderId: row.sender_id,
                    contentText: row.content_text,
                    type: row.type as MessageType,
                    replyToMessageId: row.reply_to_message_id || undefined,
                    mediaUrl: row.media_url || undefined,
                    mediaMetadata: row.media_metadata
                        ? JSON.parse(row.media_metadata)
                        : undefined,
                });

                // Mirror the live-send fanout: delivery receipts for online
                // peers first, then chat:new_message to every member.
                const memberIds = ChatService.getChatMemberIds(row.chat_id);
                for (const memberId of memberIds) {
                    if (memberId !== row.sender_id && PresenceService.isUserOnline(memberId)) {
                        MessageService.updateReceipt(msg.id, memberId, 'DELIVERED');
                        msg.status = 'DELIVERED';
                    }
                }
                PresenceService.broadcastToUsers(memberIds, {
                    type: 'chat:new_message',
                    payload: { message: msg, chat_id: msg.chat_id },
                    timestamp: Date.now(),
                });

                BaseService.execute(
                    'UPDATE scheduled_messages SET sent_message_id = ? WHERE id = ?',
                    [msg.id, row.id]
                );
                dispatched++;
            } catch (err) {
                console.error(`[Scheduled Dispatch] failed for ${row.id}:`, err);
            }
        }
        return dispatched;
    }

    /**
     * Hard-delete messages whose expires_at has passed (server-enforced
     * disappearing messages) and notify members via chat:messages_deleted (batched),
     * the same frame a manual delete emits. Cascades clean up receipts, reactions
     * and pins; the messages_fts delete trigger keeps search consistent.
     */
    static deleteExpiredMessages(): number {
        const expired = BaseService.query<{ id: string; chat_id: string }>(
            `SELECT id, chat_id FROM messages
             WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')
             LIMIT 200`,
            []
        );
        if (expired.length === 0) return 0;

        // Batch DELETE by collecting IDs per chat.
        const idsByChat = new Map<string, string[]>();
        for (const row of expired) {
            const arr = idsByChat.get(row.chat_id) ?? [];
            arr.push(row.id);
            idsByChat.set(row.chat_id, arr);
        }

        // Single DELETE per chat with IN clause.
        for (const [chatId, ids] of idsByChat) {
            const placeholders = ids.map(() => '?').join(',');
            BaseService.execute(
                `DELETE FROM messages WHERE id IN (${placeholders})`,
                ids
            );

            // One batched broadcast per chat.
            const memberIds = ChatService.getChatMemberIds(chatId);
            PresenceService.broadcastToUsers(memberIds, {
                type: 'chat:messages_deleted',
                payload: { chat_id: chatId, message_ids: ids },
                timestamp: Date.now(),
            });
        }
        return expired.length;
    }
}
