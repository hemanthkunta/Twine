import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { Message, MessageType, ReceiptStatus, UserSummary, Poll, PollOption } from '../types/protocol.js';

export class MessageService {
  static createMessage(params: {
    chatId: string;
    senderId: string;
    contentText: string;
    type?: MessageType;
    replyToMessageId?: string;
    ciphertextPayload?: string;
    mediaUrl?: string;
    mediaMetadata?: any;
  }): Message {
    const msgId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const msgType = params.type || 'TEXT';
    const metadataStr = params.mediaMetadata ? JSON.stringify(params.mediaMetadata) : null;

    db.prepare(`
      INSERT INTO messages (id, chat_id, sender_id, reply_to_message_id, type, content_text, ciphertext_payload, media_url, media_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msgId,
      params.chatId,
      params.senderId,
      params.replyToMessageId || null,
      msgType,
      params.contentText,
      params.ciphertextPayload || null,
      params.mediaUrl || null,
      metadataStr
    );

    // Initial receipt: creator has SENT it
    const rcptId = `rcpt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.prepare(`
      INSERT INTO message_receipts (id, message_id, user_id, status)
      VALUES (?, ?, ?, 'SENT')
    `).run(rcptId, msgId, params.senderId);

    // Update chat updated_at
    db.prepare(`UPDATE chats SET updated_at = datetime('now') WHERE id = ?`).run(params.chatId);

    return this.getMessageById(msgId)!;
  }

  static getMessageById(id: string): Message | null {
    const row = db.prepare(`
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.id = ?
    `).get(id) as any;

    if (!row) return null;
    return this.formatMessageRow(row);
  }

  static getChatMessages(chatId: string, limit = 50, beforeCreatedAt?: string): Message[] {
    let query = `
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.chat_id = ? AND m.is_deleted = 0
    `;
    const params: any[] = [chatId];

    if (beforeCreatedAt) {
      query += ` AND m.created_at < ?`;
      params.push(beforeCreatedAt);
    }

    query += ` ORDER BY m.created_at ASC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => this.formatMessageRow(r));
  }

  static editMessage(messageId: string, senderId: string, newText: string): Message | null {
    const msg = db.prepare('SELECT sender_id FROM messages WHERE id = ?').get(messageId) as any;
    if (!msg || msg.sender_id !== senderId) {
      throw new Error('Not authorized to edit this message');
    }

    db.prepare(`
      UPDATE messages 
      SET content_text = ?, is_edited = 1, edit_timestamp = datetime('now')
      WHERE id = ?
    `).run(newText, messageId);

    return this.getMessageById(messageId);
  }

  static deleteMessage(messageId: string, userId: string): { success: boolean; chatId: string } {
    const msg = db.prepare('SELECT chat_id, sender_id FROM messages WHERE id = ?').get(messageId) as any;
    if (!msg) throw new Error('Message not found');

    db.prepare(`UPDATE messages SET is_deleted = 1 WHERE id = ?`).run(messageId);
    return { success: true, chatId: msg.chat_id };
  }

  static toggleReaction(messageId: string, userId: string, emoji: string): { chatId: string; reactions: Record<string, string[]> } {
    const msg = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(messageId) as any;
    if (!msg) throw new Error('Message not found');

    const existing = db.prepare(`
      SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?
    `).get(messageId, userId, emoji) as any;

    if (existing) {
      db.prepare(`DELETE FROM message_reactions WHERE id = ?`).run(existing.id);
    } else {
      const id = `re_${crypto.randomUUID().slice(0, 12)}`;
      db.prepare(`
        INSERT INTO message_reactions (id, message_id, user_id, emoji)
        VALUES (?, ?, ?, ?)
      `).run(id, messageId, userId, emoji);
    }

    return {
      chatId: msg.chat_id,
      reactions: this.getMessageReactions(messageId),
    };
  }

  static getMessageReactions(messageId: string): Record<string, string[]> {
    const rows = db.prepare(`
      SELECT emoji, user_id FROM message_reactions WHERE message_id = ?
    `).all(messageId) as { emoji: string; user_id: string }[];

    const result: Record<string, string[]> = {};
    for (const r of rows) {
      if (!result[r.emoji]) result[r.emoji] = [];
      result[r.emoji].push(r.user_id);
    }
    return result;
  }

  static searchMessages(userId: string, query: string): Message[] {
    const q = `%${query.trim().toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      JOIN chat_members cm ON m.chat_id = cm.chat_id AND cm.user_id = ?
      WHERE m.is_deleted = 0 AND LOWER(m.content_text) LIKE ?
      ORDER BY m.created_at DESC
      LIMIT 30
    `).all(userId, q) as any[];

    return rows.map((r) => this.formatMessageRow(r));
  }

  static updateReceipt(messageId: string, userId: string, status: ReceiptStatus): { updated: boolean; chat_id: string } {
    const msg = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(messageId) as { chat_id: string } | undefined;
    if (!msg) return { updated: false, chat_id: '' };

    const existing = db.prepare(`
      SELECT * FROM message_receipts WHERE message_id = ? AND user_id = ?
    `).get(messageId, userId) as any;

    if (existing) {
      const weight: Record<ReceiptStatus, number> = { SENT: 1, DELIVERED: 2, READ: 3 };
      if (weight[status] > (weight[existing.status as ReceiptStatus] || 0)) {
        db.prepare(`
          UPDATE message_receipts SET status = ?, timestamp = datetime('now')
          WHERE id = ?
        `).run(status, existing.id);
        return { updated: true, chat_id: msg.chat_id };
      }
      return { updated: false, chat_id: msg.chat_id };
    }

    const rcptId = `rcpt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    db.prepare(`
      INSERT INTO message_receipts (id, message_id, user_id, status)
      VALUES (?, ?, ?, ?)
    `).run(rcptId, messageId, userId, status);

    return { updated: true, chat_id: msg.chat_id };
  }

  static markChatMessagesAsRead(chatId: string, userId: string): string[] {
    const unreadMessages = db.prepare(`
      SELECT m.id FROM messages m
      WHERE m.chat_id = ? AND m.sender_id != ?
      AND NOT EXISTS (
        SELECT 1 FROM message_receipts mr 
        WHERE mr.message_id = m.id AND mr.user_id = ? AND mr.status = 'READ'
      )
    `).all(chatId, userId, userId) as { id: string }[];

    for (const { id } of unreadMessages) {
      this.updateReceipt(id, userId, 'READ');
    }

    return unreadMessages.map((m) => m.id);
  }

  private static pollsStore: Map<string, Poll> = new Map();
  private static viewsStore: Map<string, number> = new Map();

  static createPoll(params: {
    chatId: string;
    senderId: string;
    question: string;
    options: string[];
    isAnonymous?: boolean;
    isQuiz?: boolean;
    correctOptionId?: string;
    explanation?: string;
  }): Message {
    const pollId = `poll_${crypto.randomUUID().slice(0, 12)}`;
    const pollOptions: PollOption[] = params.options.map((optText, idx) => ({
      id: `opt_${idx}_${crypto.randomUUID().slice(0, 6)}`,
      text: optText,
      vote_count: 0,
      voter_ids: [],
    }));

    const poll: Poll = {
      id: pollId,
      question: params.question,
      options: pollOptions,
      is_anonymous: Boolean(params.isAnonymous),
      is_quiz: Boolean(params.isQuiz),
      correct_option_id: params.correctOptionId,
      explanation: params.explanation,
      total_votes: 0,
      closed: false,
    };

    this.pollsStore.set(pollId, poll);

    const msg = this.createMessage({
      chatId: params.chatId,
      senderId: params.senderId,
      contentText: `📊 Poll: ${params.question}`,
      type: 'POLL',
      mediaMetadata: { pollId },
    });

    msg.poll = poll;
    return msg;
  }

  static votePoll(pollId: string, optionId: string, userId: string): Poll | null {
    const poll = this.pollsStore.get(pollId);
    if (!poll || poll.closed) return null;

    for (const opt of poll.options) {
      const existingIdx = opt.voter_ids.indexOf(userId);
      if (existingIdx !== -1) {
        opt.voter_ids.splice(existingIdx, 1);
        opt.vote_count = Math.max(0, opt.vote_count - 1);
      }
    }

    const targetOpt = poll.options.find((o) => o.id === optionId);
    if (targetOpt) {
      targetOpt.voter_ids.push(userId);
      targetOpt.vote_count += 1;
    }

    poll.total_votes = poll.options.reduce((sum: number, o: PollOption) => sum + o.vote_count, 0);
    this.pollsStore.set(pollId, poll);
    return poll;
  }

  static incrementViews(messageId: string): number {
    const current = this.viewsStore.get(messageId) || Math.floor(100 + Math.random() * 50);
    const updated = current + 1;
    this.viewsStore.set(messageId, updated);
    return updated;
  }

  static getThreadMessages(parentMessageId: string): Message[] {
    const rows = db.prepare(`
      SELECT m.*, u.username as sender_username, u.display_name as sender_name, u.avatar_url as sender_avatar, u.is_bot as sender_is_bot
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.reply_to_message_id = ? AND m.is_deleted = 0
      ORDER BY m.created_at ASC
    `).all(parentMessageId) as any[];

    return rows.map((r) => this.formatMessageRow(r));
  }

  private static formatMessageRow(row: any): Message {
    const receipts = db.prepare(`
      SELECT status FROM message_receipts WHERE message_id = ? AND user_id != ?
    `).all(row.id, row.sender_id) as { status: ReceiptStatus }[];

    let status: ReceiptStatus = 'SENT';
    if (receipts.some((r) => r.status === 'READ')) {
      status = 'READ';
    } else if (receipts.some((r) => r.status === 'DELIVERED')) {
      status = 'DELIVERED';
    }

    let replyTo: any = undefined;
    if (row.reply_to_message_id) {
      const parent = db.prepare(`
        SELECT m.id, m.sender_id, m.content_text, m.type, u.display_name as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.id = ?
      `).get(row.reply_to_message_id) as any;

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

    let mediaMetadata = undefined;
    let poll: Poll | undefined = undefined;
    if (row.media_metadata) {
      try {
        mediaMetadata = JSON.parse(row.media_metadata);
        if (mediaMetadata && mediaMetadata.pollId) {
          poll = this.pollsStore.get(mediaMetadata.pollId);
        }
      } catch {}
    }

    // Thread replies count
    const threadCountRow = db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE reply_to_message_id = ? AND is_deleted = 0
    `).get(row.id) as { count: number } | undefined;

    const views = this.viewsStore.get(row.id) || 128;

    return {
      id: row.id,
      chat_id: row.chat_id,
      sender_id: row.sender_id,
      reply_to_message_id: row.reply_to_message_id || undefined,
      reply_to: replyTo,
      type: row.type as MessageType,
      content_text: row.content_text,
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
      sender: {
        id: row.sender_id,
        username: row.sender_username,
        display_name: row.sender_name,
        avatar_url: row.sender_avatar,
        is_bot: Boolean(row.sender_is_bot),
      },
    };
  }
}
