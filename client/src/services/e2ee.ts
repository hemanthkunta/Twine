import { ApiService } from './api';
import { CryptoService } from './crypto';
import { GroupE2EEService } from './e2eeGroup.service';
import { Chat, Message } from '../types/index';

/**
 * Orchestrates E2EE on top of {@link CryptoService} (key material) and the
 * `/keys` directory (public key distribution).
 *
 * Two mechanisms, chosen by chat type:
 *  - **Direct** — one shared AES key per pair, derived by ECDH from the two
 *    identity keys. See `sealForPeer`/`openFromPeer`.
 *  - **Group** — per-sender ratchets, distributed as sealed copies.
 *    See {@link GroupE2EEService}.
 *
 * Messages that cannot be sealed are sent in the clear rather than failing, so a
 * peer who has never signed in (and therefore published no key) can still be
 * messaged. That fallback is why the UI must not blanket-claim encryption for
 * every message; it is described per message instead.
 */

/** userId -> public key, or null when the user has never published one. */
const peerKeyCache = new Map<string, string | null>();
let publishedForKey: string | null = null;

export class E2EEService {
    /** Drop cached lookups (logout / account switch). */
    static reset(): void {
        peerKeyCache.clear();
        publishedForKey = null;
    }

    /**
     * Initialise the identity key and advertise its public half.
     * Idempotent — republishing is skipped while the key is unchanged.
     */
    static async ensureIdentityPublished(userId: string): Promise<string> {
        const { publicKeyBase64 } = await CryptoService.initIdentityKey(userId);
        if (publishedForKey === publicKeyBase64) return publicKeyBase64;

        try {
            await ApiService.publishPublicKey(publicKeyBase64);
            publishedForKey = publicKeyBase64;
        } catch (err) {
            // Someone else is offline or the request failed; encryption still
            // works for peers who already have our key.
            console.warn('E2EE: could not publish identity key', err);
        }
        return publicKeyBase64;
    }

    /** Cached peer public key lookup. Returns null when unavailable. */
    static async getPeerKey(userId: string): Promise<string | null> {
        if (peerKeyCache.has(userId)) return peerKeyCache.get(userId) ?? null;
        try {
            const res = await ApiService.getPublicKey(userId);
            peerKeyCache.set(userId, res.public_key);
            return res.public_key;
        } catch {
            // 404 = never published, or a transient failure. Either way we cannot
            // encrypt to this peer right now.
            peerKeyCache.set(userId, null);
            return null;
        }
    }

    /** Direct chats between two humans are the only sealable conversations. */
    static isSealable(chat: Chat | null | undefined): boolean {
        return Boolean(
            chat &&
                chat.type === 'DIRECT' &&
                chat.peer_user?.id &&
                !chat.is_saved_messages
        );
    }

    /**
     * Seal an outgoing body for a direct or group chat.
     * @returns the envelope, or null when this chat cannot be sealed (caller
     *          should then send plaintext).
     */
    static async sealForChat(
        text: string,
        chat: Chat | null | undefined,
        myUserId: string
    ): Promise<string | null> {
        if (!text) return null;

        // Mirror the server's own message cap; the server cannot check the length
        // of text it cannot read.
        if (text.length > 10000) return null;

        if (GroupE2EEService.isGroupChat(chat)) {
            try {
                // Distributes this device's chain (and ingests everyone else's) if
                // that has not happened yet. Safe to call on every send.
                await GroupE2EEService.ensureKeysForChat(chat!, myUserId);
                return await GroupE2EEService.encryptGroupMessage(chat!, myUserId, text);
            } catch (err) {
                console.warn('E2EE: group sealing failed, sending in the clear', err);
                return null;
            }
        }

        if (!E2EEService.isSealable(chat)) return null;

        const peerId = chat!.peer_user!.id;
        if (peerId === myUserId) return null;

        const peerKey = await E2EEService.getPeerKey(peerId);
        if (!peerKey) return null;

        try {
            return await CryptoService.sealForPeer(text, peerKey);
        } catch (err) {
            console.warn('E2EE: sealing failed, sending in the clear', err);
            return null;
        }
    }

    /**
     * Open a sealed message in place, writing the result to `content_text`.
     *
     * Key ownership: the shared secret comes from ECDH(my private, *their*
     * public), so the key to look up is the **other participant**, which is the
     * sender for inbound messages and the chat peer for messages this user sent.
     * Using the sender's key unconditionally would fail on your own history.
     */
    static async decryptIncoming(
        message: Message,
        myUserId: string,
        peerUserId?: string | null,
        chat?: Chat | null
    ): Promise<void> {
        const payload = message.ciphertext_payload;
        if (!payload || message.content_text) return;

        // Group messages carry their own sender and ratchet iteration, so they take
        // a different path and never touch the peer-key lookup below.
        if (CryptoService.isGroupEnvelope(payload)) {
            let plain = await GroupE2EEService.decryptGroupMessage(
                payload,
                message.chat_id,
                myUserId
            );

            if (plain === null && chat) {
                // Usual cause: the sender's chain reached the server after this
                // message did, so we have not ingested it yet. Fetch, then retry once.
                try {
                    await GroupE2EEService.ensureKeysForChat(chat, myUserId);
                    plain = await GroupE2EEService.decryptGroupMessage(
                        payload,
                        message.chat_id,
                        myUserId
                    );
                } catch {
                    // Fall through to the placeholder below.
                }
            }

            message.content_text = plain ?? '[Encrypted message — key unavailable]';
            return;
        }

        if (!CryptoService.isEnvelope(payload)) return;

        const keyOwnerId = message.sender_id === myUserId ? peerUserId : message.sender_id;
        if (!keyOwnerId) {
            message.content_text = '[Encrypted message]';
            return;
        }

        const key = await E2EEService.getPeerKey(keyOwnerId);
        if (!key) {
            message.content_text = '[Encrypted message — key unavailable]';
            return;
        }

        try {
            message.content_text = await CryptoService.openFromPeer(payload, key);
        } catch {
            // Wrong key, tampered ciphertext, or a rotated identity key.
            message.content_text = '[Unable to decrypt this message]';
        }
    }

    /** Open a batch of messages, e.g. loaded history. */
    static async decryptAll(
        messages: Message[],
        myUserId: string,
        peerUserId?: string | null,
        chat?: Chat | null
    ): Promise<Message[]> {
        await Promise.all(
            messages.map((m) => E2EEService.decryptIncoming(m, myUserId, peerUserId, chat))
        );
        return messages;
    }

    /** True if any message in the list is still sealed (needs decryption). */
    static hasSealed(messages: Message[]): boolean {
        return messages.some(
            (m) =>
                !m.content_text &&
                (CryptoService.isEnvelope(m.ciphertext_payload) ||
                    CryptoService.isGroupEnvelope(m.ciphertext_payload))
        );
    }

    /**
     * Whether this chat is one we can actually seal, so the UI can state it
     * truthfully instead of showing a badge on every conversation.
     */
    static canSeal(chat: Chat | null | undefined): boolean {
        if (GroupE2EEService.isGroupChat(chat)) return true;
        return E2EEService.isSealable(chat);
    }
}
