import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { BaseService } from './base.service.js';
import { ChatService } from './chat.service.js';
import { RedisService } from './redis.service.js';
import { LinkPreviewData } from './LinkPreviewService.js';
import { SignalProtocolService } from './signalProtocol.service.js';
import { DashboardEventService } from './dashboardEventService.js';
import {
    Message,
    MessageType,
    ReceiptStatus,
    UserSummary,
    Poll,
    PollOption,
    MediaMetadata,
    MessageSummary,
} from '../types/protocol.js';

interface RawMessageRow {
    id: string;
    chat_id: string;
    sender_id: string;
    reply_to_message_id: string | null;
    type: string;
    content_text: string;
    ciphertext_payload: string | null;
    media_url: string | null;
    media_metadata: string | null;
    is_pinned: number;
    is_edited: number;
    edit_timestamp: string | null;
    is_deleted: number;
    created_at: string;
}

interface MessageRowWithSender extends RawMessageRow {
    sender_username: string;
    sender_name: string;
    sender_avatar: string | null;
    sender_is_bot: number;
}

export class MessageService {
    static async createMessage(params: {
        chatId: string;
        senderId: string;
        contentText: string;
        type?: MessageType;
        replyToMessageId?: string;
        ciphertextPayload?: string;
        mediaUrl?: string;
        mediaMetadata?: {
            width?: number;
            height?: number;
            duration?: number;
            size?: number;
            blurhash?: string;
            mime_type?: string;
            file_name?: string;
            waveform?: number[];
            pollId?: string;
        };
    }): Promise<Message> {
        // Enforce chat membership authorization
        if (!ChatService.isChatMember(params.chatId, params.senderId)) {
            throw new Error(
                `User ${params.senderId} is not authorized to send messages in chat ${params.chatId}`
            );
        }

        // Enforce maximum payload text limit (10,000 characters)
        if (params.contentText && params.contentText.length > 10000) {
            throw new Error('Message text exceeds maximum allowed limit of 10,000 characters');
        }

        // Check if chat is E2E-enabled and encrypt content if needed
        // If ciphertext_payload is already provided (client-side encryption), preserve it
        let contentToStore = params.contentText;
        let ciphertextToStore = params.ciphertextPayload;
        const isE2EE = await ChatService.isChatE2EE(params.chatId);
        if (isE2EE) {
            // If client already provided encrypted content, use it as-is
            if (params.ciphertextPayload) {
                // Client did the encryption - preserve their work
                contentToStore = ''; // Keep content empty as client sent it
                ciphertextToStore = params.ciphertextPayload;
            } else if (params.contentText) {
                // Server needs to encrypt (e.g., bot messages, system messages)
                contentToStore = await SignalProtocolService.encryptMessage(
                    params.senderId,
                    params.chatId, // Using chatId as recipient identifier for simplicity
                    params.contentText
                );
            }
        }

        const msgId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        const msgType = params.type || 'TEXT';
        const metadataStr = params.mediaMetadata ? JSON.stringify(params.mediaMetadata) : null;

        BaseService.execute(
            `
      INSERT INTO messages (id, chat_id, sender_id, reply_to_message_id, type, content_text, ciphertext_payload, media_url, media_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
            [
                msgId,
                params.chatId,
                params.senderId,
                params.replyToMessageId || null,
                msgType,
                contentToStore,
                ciphertextToStore || null,
                params.mediaUrl || null,
                metadataStr,
            ]
        );

        // Initial receipt: creator has SENT it
        const rcptId = `rcpt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        BaseService.execute(
            `
      INSERT INTO message_receipts (id, message_id, user_id, status)
      VALUES (?, ?, ?, 'SENT')
    `,
            [rcptId, msgId, params.senderId]
        );

        // Update chat updated_at
        BaseService.execute(`UPDATE chats SET updated_at = datetime('now') WHERE id = ?`, [
            params.chatId,
        ]);

        // Emit dashboard event for message sent
        DashboardEventService.emitMessageFlowMetricsUpdate({
            event: 'message_sent',
            chatId: params.chatId,
            senderId: params.senderId,
            timestamp: new Date().toISOString()
        });

        return (await this.getMessageById(msgId))!;
    }

    static async getMessageById(id: string): Promise<Message | null> {
        const row = BaseService.queryOne<MessageRowWithSender>(
            `
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `,
            [id]
        );

        if (!row) return null;
        return await this.formatMessageRow(row);
    }

    /**
     * Load a chat's messages.
     *
     * @param viewerId When supplied, messages the viewer has cleared from their
     *   own history are omitted. Callers that intentionally read the raw shared
     *   history instead of one member's view (such as the AI bot's context)
     *   simply omit it.
     */
    static async getChatMessages(
        chatId: string,
        limit = 50,
        beforeCreatedAt?: string,
        viewerId?: string
    ): Promise<Message[]> {
        let query = `
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = ? AND m.is_deleted = 0
    `;
        const params: (string | number)[] = [chatId];

        // Hide messages this member cleared from their own history.
        if (viewerId) {
            query += ` AND ${ChatService.NOT_CLEARED_PREDICATE}`;
            params.push(viewerId);
        }

        if (beforeCreatedAt) {
            query += ` AND m.created_at < ?`;
            params.push(beforeCreatedAt);
        }

        query += ` ORDER BY m.created_at ASC LIMIT ?`;
        params.push(limit);

        const rows = BaseService.query<MessageRowWithSender>(query, params);
        const messages: Message[] = [];
        for (const r of rows) {
            messages.push(await this.formatMessageRow(r));
        }
        return messages;
    }

    static async editMessage(
        messageId: string,
        senderId: string,
        newText: string
    ): Promise<Message | null> {
        const msg = db
            .prepare(
                `
            SELECT sender_id, chat_id, is_deleted
            FROM messages
            WHERE id = ?
            `
            )
            .get(messageId) as
            | {
                  sender_id: string;
                  chat_id: string;
                  is_deleted: number;
              }
            | undefined;

        if (!msg) {
            throw new Error('Message not found');
        }

        if (msg.is_deleted) {
            throw new Error('Cannot edit a deleted message');
        }

        if (!ChatService.isChatMember(msg.chat_id, senderId)) {
            throw new Error('You are not a member of this chat');
        }

        if (msg.sender_id !== senderId) {
            throw new Error('Not authorized to edit this message');
        }

        const result = BaseService.execute(
            `
            UPDATE messages
            SET content_text = ?,
                is_edited = 1,
                edit_timestamp = datetime('now')
            WHERE id = ?
              AND sender_id = ?
              AND is_deleted = 0
        `,
            [newText, messageId, senderId]
        );

        if (result.changes === 0) {
            throw new Error('Message could not be edited');
        }

        // Emit dashboard event for message edited
        DashboardEventService.emitMessageFlowMetricsUpdate({
            event: 'message_edited',
            messageId: messageId,
            senderId: senderId,
            timestamp: new Date().toISOString()
        });

        return await this.getMessageById(messageId);
    }

    static deleteMessage(messageId: string, userId: string): { success: boolean; chatId: string } {
        const msg = BaseService.queryOne<{
            chat_id: string;
            sender_id: string;
            is_deleted: number;
        }>(
            `
      SELECT chat_id, sender_id, is_deleted
      FROM messages
      WHERE id = ?
      `,
            [messageId]
        );

        if (!msg) {
            throw new Error('Message not found');
        }

        if (msg.is_deleted) {
            return {
                success: true,
                chatId: msg.chat_id,
            };
        }

        if (msg.sender_id !== userId) {
            throw new Error('Not authorized to delete this message');
        }

        BaseService.execute(
            `
      UPDATE messages
      SET is_deleted = 1
      WHERE id = ?
        AND sender_id = ?
        AND is_deleted = 0
      `,
            [messageId, userId]
        );

        // Emit dashboard event for message deleted
        DashboardEventService.emitMessageFlowMetricsUpdate({
            event: 'message_deleted',
            messageId: messageId,
            userId: userId,
            timestamp: new Date().toISOString()
        });

        return {
            success: true,
            chatId: msg.chat_id,
        };
    }

    static toggleReaction(
        messageId: string,
        userId: string,
        emoji: string
    ): { chatId: string; reactions: Record<string, string[]> } {
        const msg = BaseService.queryOne<{ chat_id: string }>(
            'SELECT chat_id FROM messages WHERE id = ?',
            [messageId]
        );
        if (!msg) throw new Error('Message not found');

        const existing = BaseService.queryOne<{ id: string }>(
            `
        SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?
      `,
            [messageId, userId, emoji]
        );

        if (existing) {
            BaseService.execute(`DELETE FROM message_reactions WHERE id = ?`, [existing.id]);

            // Emit dashboard event for reaction removed
            DashboardEventService.emitMessageFlowMetricsUpdate({
                event: 'reaction_removed',
                messageId: messageId,
                userId: userId,
                emoji: emoji,
                timestamp: new Date().toISOString()
            });
        } else {
            const id = `re_${crypto.randomUUID().slice(0, 12)}`;
            BaseService.execute(
                `
            INSERT INTO message_reactions (id, message_id, user_id, emoji)
            VALUES (?, ?, ?, ?)
          `,
                [id, messageId, userId, emoji]
            );

            // Emit dashboard event for reaction added
            DashboardEventService.emitMessageFlowMetricsUpdate({
                event: 'reaction_added',
                messageId: messageId,
                userId: userId,
                emoji: emoji,
                timestamp: new Date().toISOString()
            });
        }

        return {
            chatId: msg.chat_id,
            reactions: this.getMessageReactions(messageId),
        };
    }

    static getMessageReactions(messageId: string): Record<string, string[]> {
        const rows = BaseService.query(
            `
      SELECT emoji, user_id FROM message_reactions WHERE message_id = ?
    `,
            [messageId]
        ) as { emoji: string; user_id: string }[];

        const result: Record<string, string[]> = {};
        for (const r of rows) {
            if (!result[r.emoji]) result[r.emoji] = [];
            result[r.emoji].push(r.user_id);
        }
        return result;
    }

    static async searchMessages(
        userId: string,
        params: {
            query: string;
            senderId?: string;
            startDate?: string;
            endDate?: string;
            messageType?: string;
            chatId?: string;
        }
    ): Promise<Message[]> {
        const { query, senderId, startDate, endDate, messageType, chatId } = params;
        const q = `%${query.trim().toLowerCase()}%`;

        // Build query dynamically. The chat_members join is already scoped to the
        // requesting user, so history they cleared must not surface in search
        // results either.
        let sql = `
              SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
              FROM messages m
              JOIN users u ON m.sender_id = u.id
              JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
              WHERE m.is_deleted = 0
                AND m.created_at > COALESCE(cm.cleared_at, '')
          `;

        const paramsArray: string[] = [userId];

        if (query.trim() !== '') {
            sql += ` AND LOWER(m.content_text) LIKE ?`;
            paramsArray.push(q);
        }

        if (senderId) {
            sql += ` AND m.sender_id = ?`;
            paramsArray.push(senderId);
        }

        if (startDate) {
            sql += ` AND m.created_at >= ?`;
            paramsArray.push(startDate);
        }

        if (endDate) {
            sql += ` AND m.created_at <= ?`;
            paramsArray.push(endDate);
        }

        if (messageType) {
            sql += ` AND m.type = ?`;
            paramsArray.push(messageType);
        }

        if (chatId) {
            sql += ` AND m.chat_id = ?`;
            paramsArray.push(chatId);
        }

        sql += ` ORDER BY m.created_at DESC LIMIT 30`;

        const rows = BaseService.query(sql, paramsArray) as MessageRowWithSender[];

        return Promise.all(rows.map((r) => this.formatMessageRow(r)));
    }

    static updateReceipt(
        messageId: string,
        userId: string,
        status: ReceiptStatus
    ): { updated: boolean; chat_id: string } {
        const msg = BaseService.queryOne<{ chat_id: string }>(
            'SELECT chat_id FROM messages WHERE id = ?',
            [messageId]
        );
        if (!msg) return { updated: false, chat_id: '' };

        const existing = BaseService.queryOne(
            `
      SELECT * FROM message_receipts WHERE message_id = ? AND user_id = ?
    `,
            [messageId, userId]
        ) as any;

        if (existing) {
            const weight: Record<ReceiptStatus, number> = {
                QUEUED: 0,
                SENT: 1,
                DELIVERED: 2,
                READ: 3,
                FAILED: -1,
            };
            if (weight[status] > (weight[existing.status as ReceiptStatus] || 0)) {
                BaseService.execute(
                    `
            UPDATE message_receipts SET status = ?, timestamp = datetime('now')
            WHERE id = ?
          `,
                    [status, existing.id]
                );
                return { updated: true, chat_id: msg.chat_id };
            }
            return { updated: false, chat_id: msg.chat_id };
        }

        const rcptId = `rcpt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        BaseService.execute(
            `
      INSERT INTO message_receipts (id, message_id, user_id, status)
      VALUES (?, ?, ?, ?)
    `,
            [rcptId, messageId, userId, status]
        );

        return { updated: true, chat_id: msg.chat_id };
    }

    static markChatMessagesAsRead(chatId: string, userId: string): string[] {
        const unreadMessages = BaseService.query<{ id: string }>(
            `
      SELECT m.id FROM messages m
      WHERE m.chat_id = ? AND m.sender_id != ?
      AND ${ChatService.NOT_CLEARED_PREDICATE}
      AND NOT EXISTS (
        SELECT 1 FROM message_receipts mr
        WHERE mr.message_id = m.id AND mr.user_id = ? AND mr.status = 'READ'
      )
    `,
            [chatId, userId, userId, userId]
        );

        for (const { id } of unreadMessages) {
            this.updateReceipt(id, userId, 'READ');
        }

        return unreadMessages.map((m) => m.id);
    }

    // Using Redis-backed storage instead of in-memory maps

    static async createPoll(params: {
        chatId: string;
        senderId: string;
        question: string;
        options: string[];
        isAnonymous?: boolean;
        isQuiz?: boolean;
        correctOptionId?: string;
        correctOptionIndex?: number;
        explanation?: string;
    }): Promise<Message> {
        const pollId = `poll_${crypto.randomUUID().slice(0, 12)}`;
        const pollOptions: PollOption[] = params.options.map((optText, idx) => ({
            id: `opt_${idx}_${crypto.randomUUID().slice(0, 6)}`,
            text: optText,
            vote_count: 0,
            voter_ids: [],
        }));

        const correctOptionId =
            typeof params.correctOptionIndex === 'number'
                ? pollOptions[params.correctOptionIndex]?.id
                : params.correctOptionId;

        const poll: Poll = {
            id: pollId,
            question: params.question,
            options: pollOptions,
            is_anonymous: Boolean(params.isAnonymous),
            is_quiz: Boolean(params.isQuiz),
            correct_option_id: correctOptionId,
            explanation: params.explanation,
            total_votes: 0,
            closed: false,
        };

        // Persist the poll and its options to SQLite so polls survive restarts
        // (replaces the previous Redis/in-memory-only storage).
        db.prepare(
            `
            INSERT INTO polls (id, question, is_anonymous, is_quiz, correct_option_id, explanation, total_votes, closed)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0)
            `
        ).run(
            pollId,
            params.question,
            params.isAnonymous ? 1 : 0,
            params.isQuiz ? 1 : 0,
            correctOptionId || null,
            params.explanation || null
        );

        const insertOption = db.prepare(
            `
            INSERT INTO poll_options (id, poll_id, position, text)
            VALUES (?, ?, ?, ?)
            `
        );
        pollOptions.forEach((option, idx) => {
            insertOption.run(option.id, pollId, idx, option.text);
        });

        // Emit dashboard event for poll created
        DashboardEventService.emitMessageFlowMetricsUpdate({
            event: 'poll_created',
            pollId: pollId,
            chatId: params.chatId,
            senderId: params.senderId,
            question: params.question,
            optionsCount: params.options.length,
            timestamp: new Date().toISOString()
        });

        const msg = await this.createMessage({
            chatId: params.chatId,
            senderId: params.senderId,
            contentText: `📊 Poll: ${params.question}`,
            type: 'POLL',
            mediaMetadata: { pollId },
        });

        msg.poll = poll;
        return msg;
    }

    static async votePoll(pollId: string, optionId: string, userId: string): Promise<Poll | null> {
        // Get poll from SQLite (persists across restarts)
        const poll = await this.getPoll(pollId);

        if (!poll || poll.closed) {
            return null;
        }

        // Locate the message containing this poll.
        const message = BaseService.queryOne<{ chat_id: string }>(
            `
            SELECT chat_id
            FROM messages
            WHERE type = 'POLL'
              AND media_metadata LIKE ?
            LIMIT 1
        `,
            [`%\"pollId\":\"${pollId}\"%`]
        );

        if (!message) {
            throw new Error('Poll message not found');
        }

        // Only members of the poll's chat may vote.
        if (!ChatService.isChatMember(message.chat_id, userId)) {
            throw new Error('You are not a member of this chat');
        }

        const targetOpt = poll.options.find((option: PollOption) => option.id === optionId);

        if (!targetOpt) {
            throw new Error('Poll option not found');
        }

        // Replace any existing vote from this user (one vote per poll).
        db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND user_id = ?').run(
            pollId,
            userId
        );

        db.prepare(
            `
            INSERT INTO poll_votes (poll_id, option_id, user_id)
            VALUES (?, ?, ?)
            `
        ).run(pollId, targetOpt.id, userId);

        // Recompute tallies from the persisted votes so counts stay accurate.
        const updatedPoll = await this.getPoll(pollId);

        if (updatedPoll) {
            db.prepare('UPDATE polls SET total_votes = ? WHERE id = ?').run(
                updatedPoll.total_votes,
                pollId
            );
        }

        return updatedPoll;
    }

    /**
     * Load a poll and its current vote tallies from SQLite.
     * Replaces the previous Redis-backed poll storage so polls survive restarts.
     */
    static async getPoll(pollId: string): Promise<Poll | null> {
        const pollRow = db
            .prepare(
                `
            SELECT id, question, is_anonymous, is_quiz, correct_option_id, explanation, closed
            FROM polls
            WHERE id = ?
            `
            )
            .get(pollId) as
            | {
                  id: string;
                  question: string;
                  is_anonymous: number;
                  is_quiz: number;
                  correct_option_id: string | null;
                  explanation: string | null;
                  closed: number;
              }
            | undefined;

        if (!pollRow) {
            return null;
        }

        const optionRows = db
            .prepare(
                `
            SELECT id, position, text
            FROM poll_options
            WHERE poll_id = ?
            ORDER BY position ASC
            `
            )
            .all(pollId) as Array<{ id: string; position: number; text: string }>;

        const voteRows = db
            .prepare(
                `
            SELECT option_id, user_id
            FROM poll_votes
            WHERE poll_id = ?
            `
            )
            .all(pollId) as Array<{ option_id: string; user_id: string }>;

        const voterIdsByOption = new Map<string, string[]>();
        for (const vote of voteRows) {
            const voters = voterIdsByOption.get(vote.option_id) ?? [];
            voters.push(vote.user_id);
            voterIdsByOption.set(vote.option_id, voters);
        }

        const options: PollOption[] = optionRows.map((option) => {
            const voterIds = voterIdsByOption.get(option.id) ?? [];
            return {
                id: option.id,
                text: option.text,
                vote_count: voterIds.length,
                voter_ids: voterIds,
            };
        });

        return {
            id: pollRow.id,
            question: pollRow.question,
            options,
            is_anonymous: Boolean(pollRow.is_anonymous),
            is_quiz: Boolean(pollRow.is_quiz),
            correct_option_id: pollRow.correct_option_id || undefined,
            explanation: pollRow.explanation || undefined,
            total_votes: options.reduce((sum, o) => sum + o.vote_count, 0),
            closed: Boolean(pollRow.closed),
        };
    }

    static async incrementViews(messageId: string): Promise<number> {
        return await RedisService.getInstance().incrementViews(messageId);
    }

    static async getViews(messageId: string): Promise<number> {
        return await RedisService.getInstance().getViews(messageId);
    }

    static async getThreadMessages(parentMessageId: string): Promise<Message[]> {
        const rows = BaseService.query(
            `
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.reply_to_message_id = ? AND m.is_deleted = 0
      ORDER BY m.created_at ASC
    `,
            [parentMessageId]
        ) as MessageRowWithSender[];

        return Promise.all(rows.map((r) => this.formatMessageRow(r)));
    }

    private static async formatMessageRow(row: MessageRowWithSender): Promise<Message> {
        // Check if chat is E2E-enabled and decrypt content if needed
        // Priority: decrypt ciphertext_payload if present, otherwise use content_text
        let contentText = row.content_text;
        const isE2EE = await ChatService.isChatE2EE(row.chat_id);
        if (isE2EE) {
            // If we have encrypted payload, try to decrypt it first
            if (row.ciphertext_payload) {
                try {
                    const decrypted = await SignalProtocolService.decryptMessage(
                        row.chat_id, // Using chatId as recipient identifier for simplicity
                        row.sender_id,
                        row.ciphertext_payload
                    );
                    // Only use decrypted content if decryption succeeded
                    if (decrypted) {
                        contentText = decrypted;
                    }
                } catch (err) {
                    // If decryption fails, keep original content (could be plaintext or already decrypted)
                    console.warn(`Failed to decrypt message ${row.id}:`, err);
                    // Fall back to content_text below
                }
            }
            // If no ciphertext_payload or decryption failed, try content_text
            else if (row.content_text) {
                try {
                    const decrypted = await SignalProtocolService.decryptMessage(
                        row.chat_id, // Using chatId as recipient identifier for simplicity
                        row.sender_id,
                        row.content_text
                    );
                    // Only use decrypted content if decryption succeeded and returned different content
                    if (decrypted && decrypted !== row.content_text) {
                        contentText = decrypted;
                    }
                } catch (err) {
                    // If decryption fails, keep original content (could be plaintext or already decrypted)
                    console.warn(`Failed to decrypt message ${row.id}:`, err);
                    // Keep original contentText
                }
            }
        }

        const receipts = BaseService.query<{ status: ReceiptStatus }>(
            `
      SELECT status FROM message_receipts WHERE message_id = ? AND user_id != ?
    `,
            [row.id, row.sender_id]
        );

        let status: ReceiptStatus = 'SENT';
        if (receipts.some((r) => r.status === 'READ')) {
            status = 'READ';
        } else if (receipts.some((r) => r.status === 'DELIVERED')) {
            status = 'DELIVERED';
        }

        let replyTo: MessageSummary | undefined;
        if (row.reply_to_message_id) {
            const parent = BaseService.queryOne<MessageSummary>(
                `
            SELECT m.id, m.sender_id, m.content_text, m.type, u.display_name as sender_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.id = ?
          `,
                [row.reply_to_message_id]
            );

            if (parent) {
                replyTo = {
                    id: parent.id,
                    sender_id: parent.sender_id,
                    sender_name: parent.sender_name,
                    content_text: parent.content_text,
                    type: parent.type,
                };
            }
        }

        // Parse media metadata if present
        let mediaMetadata = undefined;
        let poll: Poll | undefined = undefined;
        let linkPreview: LinkPreviewData | undefined = undefined;
        if (row.media_metadata) {
            try {
                mediaMetadata = JSON.parse(row.media_metadata);
                if (mediaMetadata && mediaMetadata.pollId) {
                    // Load poll from SQLite (persists across restarts)
                    poll = (await this.getPoll(mediaMetadata.pollId)) ?? undefined;
                }
                // Extract link preview data if present
                if (mediaMetadata && mediaMetadata.url) {
                    linkPreview = {
                        url: mediaMetadata.url,
                        title: mediaMetadata.title,
                        description: mediaMetadata.description,
                        imageUrl: mediaMetadata.imageUrl,
                        siteName: mediaMetadata.siteName,
                        faviconUrl: mediaMetadata.faviconUrl,
                        type: mediaMetadata.type,
                    };
                }
            } catch {}
        }

        // Thread replies count
        const threadCountRow = BaseService.queryOne<{ count: number }>(
            `
      SELECT COUNT(*) as count FROM messages WHERE reply_to_message_id = ? AND is_deleted = 0
    `,
            [row.id]
        );

        // Get views from Redis
        const views = (await RedisService.getInstance().getViews(row.id)) || 128;

        return {
            id: row.id,
            chat_id: row.chat_id,
            sender_id: row.sender_id,
            reply_to_message_id: row.reply_to_message_id || undefined,
            reply_to: replyTo,
            type: row.type as MessageType,
            content_text: contentText,
            ciphertext_payload: row.ciphertext_payload || undefined,
            media_url: row.media_url || undefined,
            media_metadata: mediaMetadata,
            poll,
            views_count: views,
            thread_message_count: threadCountRow ? threadCountRow.count : 0,
            reactions: this.getMessageReactions(row.id),
            is_pinned: Boolean(row.is_pinned),
            is_edited: Boolean(row.is_edited),
            edit_timestamp: row.edit_timestamp || undefined,
            is_deleted: Boolean(row.is_deleted),
            created_at: row.created_at,
            status,
            linkPreview,
            sender: {
                id: row.sender_id,
                username: row.sender_username,
                display_name: row.sender_name,
                avatar_url: row.sender_avatar ?? undefined,
                is_bot: Boolean(row.sender_is_bot),
            },
        };
    }
}
