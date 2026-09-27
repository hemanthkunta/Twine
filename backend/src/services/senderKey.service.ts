import crypto from 'node:crypto';
import { BaseService } from './base.service.js';
import { ChatService } from './chat.service.js';

/**
 * Opaque per-recipient storage for group E2EE sender keys.
 *
 * Group chats cannot share one secret key: any member could then impersonate any
 * other. Instead every member mints their own *sender key* and distributes one
 * sealed copy to each other member. The sealing (ECDH + AES-256-GCM) happens in
 * the browser, so everything in this table is a ciphertext the recipient — and
 * only the recipient — can open.
 *
 * The consequence, and the reason this service never inspects a value: the server
 * cannot read a single group message. It stores `wrapped_key` as an opaque string
 * and routes it. There is deliberately no column holding a chain key in the clear
 * (an earlier design had one, which would have handed the server every group).
 *
 * ## Known limitation
 *
 * Wraps are encrypted but not *signed* — ECDH keys cannot sign. A malicious server
 * could therefore substitute a wrap under another member's `sender_id`, and the
 * recipient would decrypt it successfully because the AEAD key would be genuine.
 * Detecting that requires authenticated identity keys (signatures) or comparing
 * safety numbers out of band, which is where trust currently rests. What the
 * `chatId`/`senderId` binding in the sealed payload does defend is accidental
 * cross-chat and cross-sender mixups by an honest server.
 */

export interface SenderKeyUpload {
    recipientId: string;
    wrappedKey: string;
}

export interface StoredSenderKey {
    sender_id: string;
    wrapped_key: string;
    updated_at: string;
}

/**
 * A sealed blob is `{v,n,c}` JSON. P-256 keys are small (a chain key is 32 bytes,
 * so a few hundred characters sealed), and the cap keeps a hostile client from
 * pushing megabytes into the table.
 */
const MAX_WRAPPED_KEY_LENGTH = 4096;
const MAX_RECIPIENTS_PER_REQUEST = 512;

export class SenderKeyService {
    /**
     * Shape check for an uploaded wrap. This is not a cryptographic check — the
     * only thing that can really validate a wrap is the recipient opening it.
     */
    static isValidWrappedKey(value: unknown): value is string {
        if (typeof value !== 'string') return false;
        if (value.length < 16 || value.length > MAX_WRAPPED_KEY_LENGTH) return false;
        try {
            const parsed = JSON.parse(value) as { v?: unknown; n?: unknown; c?: unknown };
            return typeof parsed.n === 'string' && typeof parsed.c === 'string';
        } catch {
            return false;
        }
    }

    /**
     * Store one wrapped copy of the caller's sender key per recipient.
     *
     * Both the sender and every recipient must currently be members: without that
     * check any authenticated user could write arbitrary rows into a group's key
     * set, and a non-member could be handed group keys.
     *
     * Idempotent — republishing a recipient's wrap replaces it, which is also how
     * a rotated sender key replaces the previous distribution.
     */
    static publish(
        chatId: string,
        senderId: string,
        uploads: SenderKeyUpload[]
    ): { stored: number } {
        if (!ChatService.isChatMember(chatId, senderId)) {
            throw new ForbiddenError('You are not a member of this chat');
        }

        if (!Array.isArray(uploads) || uploads.length === 0) {
            throw new BadRequestError('At least one wrapped key is required');
        }
        if (uploads.length > MAX_RECIPIENTS_PER_REQUEST) {
            throw new BadRequestError(`At most ${MAX_RECIPIENTS_PER_REQUEST} keys per request`);
        }

        // Validate everything before writing anything, so a malformed entry midway
        // through cannot leave a group half-keyed.
        for (const entry of uploads) {
            if (!entry || typeof entry.recipientId !== 'string' || !entry.recipientId) {
                throw new BadRequestError('Each key needs a recipientId');
            }
            if (!SenderKeyService.isValidWrappedKey(entry.wrappedKey)) {
                throw new BadRequestError('Each wrapped key must be a sealed {n,c} payload');
            }
            if (!ChatService.isChatMember(chatId, entry.recipientId)) {
                throw new BadRequestError('A recipient is not a member of this chat');
            }
        }

        let stored = 0;
        for (const entry of uploads) {
            const id = `gsk_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
            BaseService.execute(
                `INSERT INTO group_sender_keys (id, chat_id, sender_id, recipient_id, wrapped_key)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(chat_id, sender_id, recipient_id) DO UPDATE SET
                   wrapped_key = excluded.wrapped_key,
                   updated_at = datetime('now')`,
                [id, chatId, senderId, entry.recipientId, entry.wrappedKey]
            );
            stored += 1;
        }

        return { stored };
    }

    /**
     * Wraps addressed to the caller. Only rows where `recipient_id` is the caller
     * are returned, so a member can never read another member's copy, and the
     * returned `sender_id` tells the client whose ratchet each chain key belongs to.
     */
    static getForRecipient(chatId: string, recipientId: string): StoredSenderKey[] {
        if (!ChatService.isChatMember(chatId, recipientId)) {
            throw new ForbiddenError('You are not a member of this chat');
        }

        return BaseService.query<StoredSenderKey>(
            `SELECT sender_id, wrapped_key, updated_at
             FROM group_sender_keys
             WHERE chat_id = ? AND recipient_id = ?`,
            [chatId, recipientId]
        );
    }

    /**
     * Which recipients the caller has already distributed a key to.
     *
     * The client uses this to decide whether it still needs to upload: if the set
     * of members it has covered no longer matches the current membership, the chat
     * membership has changed and the sender key must be rotated.
     */
    static getMyRecipients(chatId: string, senderId: string): string[] {
        const rows = BaseService.query<{ recipient_id: string }>(
            `SELECT recipient_id FROM group_sender_keys WHERE chat_id = ? AND sender_id = ?`,
            [chatId, senderId]
        );
        return rows.map((r) => r.recipient_id);
    }
}

export class BadRequestError extends Error {}
export class ForbiddenError extends Error {}
