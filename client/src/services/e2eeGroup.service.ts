import { ApiService } from './api';
import { CryptoService, GroupEnvelope, SenderKeyPayload } from './crypto';
import { offlineStorage } from './storage';
import { Chat } from '../types/index';

/**
 * Group E2EE via sender keys.
 *
 * A group has no single shared secret — if it did, every member could impersonate
 * every other. Instead each member mints their **own** chain key (their "sender
 * key") and distributes one copy to each other member, sealed to that recipient's
 * identity key. Messages are then encrypted under the sender's own ratchet, so a
 * member can only ever produce messages as themselves.
 *
 * ## The ratchet
 *
 * Each chain key derives a message key and its successor:
 *
 *     messageKey_n   = HMAC-SHA256(chainKey_n, 0x01)
 *     chainKey_{n+1} = HMAC-SHA256(chainKey_n, 0x02)
 *
 * and the chain key is then discarded. Because the chain key is the HMAC *key*,
 * somebody who obtains message key *n* cannot walk backwards or forwards to any
 * other message key. That is what makes it a ratchet rather than one long-lived
 * key.
 *
 * The previous implementation derived every message key from the *original* chain
 * key and never advanced its own state. The sender advanced and the receiver did
 * not, so the two sides computed different keys from message 1 onwards: **only the
 * first message in any group was ever decryptable.**
 *
 * ## Out-of-order and skipped messages
 *
 * A receiver may be handed message 5 before message 4 (or load history backwards).
 * Stepping forward is one-way, so the intermediate message keys are cached as they
 * are passed over; a later delivery of message 4 then hits that cache instead of
 * re-deriving something impossible. Both the step distance and the cache are
 * bounded, so a forged `it` of 10^9 cannot be used to make a client burn CPU.
 *
 * ## What this does not provide
 *
 * Sender keys give forward secrecy *within* a chain but no post-compromise
 * security: a member who obtains a chain key can read every later message until the
 * sender rotates. Rotation happens on membership change (a removed member must not
 * read what follows), not on a schedule. Membership changes are also the only check
 * on a member who was removed but kept the keys they already had.
 */

const MAX_SKIP = 200;
const MAX_CACHED_SKIPPED = 200;
const MAX_CACHED_SENT = 200;

interface SelfState {
    id: string;
    chat_id: string;
    kind: 'self';
    chain_key_hex: string;
    iteration: number;
    /** Recipient ids this chain has already been sealed for. */
    distributed_to: string[];
    /** Message keys for messages this device sent, so own history stays readable. */
    sent_keys: Record<string, string>;
}

interface PeerState {
    id: string;
    chat_id: string;
    kind: 'peer';
    sender_id: string;
    chain_key_hex: string;
    iteration: number;
    skipped: Record<string, string>;
}

export class GroupE2EEService {
    private static selfId(chatId: string): string {
        return `${chatId}::self`;
    }

    private static peerId(chatId: string, senderId: string): string {
        return `${chatId}:${senderId}`;
    }

    /** Group chats are the only conversations this service handles. */
    static isGroupChat(chat: Chat | null | undefined): boolean {
        return Boolean(
            chat &&
                (chat.type === 'GROUP' || chat.type === 'SUPERGROUP') &&
                !chat.is_saved_messages
        );
    }

    static async getSelfState(chatId: string): Promise<SelfState | null> {
        return offlineStorage.getSenderKeyState<SelfState>(GroupE2EEService.selfId(chatId));
    }

    static async getPeerState(chatId: string, senderId: string): Promise<PeerState | null> {
        return offlineStorage.getSenderKeyState<PeerState>(
            GroupE2EEService.peerId(chatId, senderId)
        );
    }

    /** Number of peer chains held for a chat — used to prove distribution worked. */
    static async countPeerStates(chatId: string): Promise<number> {
        const all = await offlineStorage.listSenderKeyStatesForChat<
            SelfState | PeerState
        >(chatId);
        return all.filter((s) => s.kind === 'peer').length;
    }

    /**
     * Make sure this device can send and receive in a group.
     *
     * Steps, all idempotent:
     *  1. read the member list
     *  2. mint a sender key if absent, or **rotate** it if the membership changed
     *  3. upload a sealed copy for every member whose copy we are missing
     *  4. fetch and ingest the copies addressed to us
     *
     * Step 2's rotation is the security-relevant part: a member who is removed
     * keeps the keys they already downloaded, so the only way to lock them out of
     * what follows is for each sender to start a new chain they are not given.
     */
    static async ensureKeysForChat(chat: Chat, myUserId: string): Promise<void> {
        if (!GroupE2EEService.isGroupChat(chat) || !myUserId) return;

        const { members } = await ApiService.getChatMembers(chat.id);
        const memberIds = members
            .map((m: { user_id?: string }) => m.user_id)
            .filter((id): id is string => Boolean(id));

        if (memberIds.length === 0) return;

        const state = await GroupE2EEService.getSelfState(chat.id);

        // Including this device, so its own history can be read back after a reload.
        const recipients = Array.from(new Set([...memberIds, myUserId]));

        const membershipChanged =
            !state ||
            [...state.distributed_to].sort().join() !== [...recipients].sort().join();

        let active: SelfState;
        let rotate = false;
        if (!state || membershipChanged) {
            // A fresh chain key. On first use that is simply setup; on a membership
            // change it is a rotation, and `distributed_to` is reset so every member
            // gets the new chain (and the removed one gets nothing).
            rotate = Boolean(state);
            active = {
                id: GroupE2EEService.selfId(chat.id),
                chat_id: chat.id,
                kind: 'self',
                chain_key_hex: CryptoService.bytesToHex(CryptoService.randomChainKey()),
                iteration: 0,
                distributed_to: [],
                sent_keys: {},
            };
            await offlineStorage.saveSenderKeyState(active);
        } else {
            active = state;
        }

        const remote = await ApiService.getSenderKeys(chat.id);

        const alreadyDistributed = new Set(
            rotate ? [] : remote.my_recipients.length ? remote.my_recipients : active.distributed_to
        );

        const uploads: Array<{ recipientId: string; wrappedKey: string }> = [];
        const payload: Omit<SenderKeyPayload, 'chatId' | 'senderId'> = {
            chainKeyHex: active.chain_key_hex,
            iteration: active.iteration,
        } as Omit<SenderKeyPayload, 'chatId' | 'senderId'>;

        for (const recipientId of recipients) {
            if (alreadyDistributed.has(recipientId)) continue;

            const peerKey = await GroupE2EEService.senderKeyRecipientKey(recipientId, myUserId);
            if (!peerKey) continue;

            const wrappedKey = await CryptoService.sealSenderKey(
                {
                    chatId: chat.id,
                    senderId: myUserId,
                    chainKeyHex: payload.chainKeyHex,
                    iteration: payload.iteration,
                },
                peerKey
            );
            uploads.push({ recipientId, wrappedKey });
        }

        if (uploads.length > 0) {
            await ApiService.publishSenderKeys(chat.id, uploads);
            active.distributed_to = Array.from(
                new Set([...active.distributed_to, ...uploads.map((u) => u.recipientId)])
            );
            await offlineStorage.saveSenderKeyState(active);
        }

        // Ingest the chains addressed to this device.
        for (const entry of remote.keys) {
            if (entry.sender_id === myUserId) continue;

            const existing = await GroupE2EEService.getPeerState(chat.id, entry.sender_id);
            const senderKey = await GroupE2EEService.identityKeyOf(entry.sender_id);
            if (!senderKey) continue;

            const opened = await CryptoService.openSenderKey(entry.wrapped_key, senderKey);
            if (!opened) continue;

            // Bind the contents to the row they arrived in, so a wrap cannot be
            // replayed into a different chat or attributed to a different sender.
            if (opened.chatId !== chat.id || opened.senderId !== entry.sender_id) continue;

            // Replace an existing chain only when the sender has clearly restarted
            // (iteration 0 with different key material). Otherwise the local copy is
            // further along than the published one and must not be rewound.
            const isRotation =
                opened.iteration === 0 && existing?.chain_key_hex !== opened.chainKeyHex;
            if (existing && !isRotation) continue;

            await offlineStorage.saveSenderKeyState({
                id: GroupE2EEService.peerId(chat.id, entry.sender_id),
                chat_id: chat.id,
                kind: 'peer',
                sender_id: entry.sender_id,
                chain_key_hex: opened.chainKeyHex,
                iteration: opened.iteration,
                skipped: {},
            } satisfies PeerState);
        }
    }

    /**
     * Public key to seal *this* device's chain for `recipientId`.
     *
     * Sealing to yourself is legitimate and intentional — the self-copy is what
     * lets the sender read their own history back. ECDH(my private, my public)
     * works exactly like any other pair.
     */
    private static async senderKeyRecipientKey(
        recipientId: string,
        myUserId: string
    ): Promise<string | null> {
        if (recipientId === myUserId) {
            const mine = CryptoService.getPublicKey();
            return mine || null;
        }
        return GroupE2EEService.identityKeyOf(recipientId);
    }

    private static async identityKeyOf(userId: string): Promise<string | null> {
        try {
            const res = await ApiService.getPublicKey(userId);
            return res.public_key || null;
        } catch {
            // Never published, or the lookup failed. That member simply cannot be
            // sealed to yet; everyone else still can.
            return null;
        }
    }

    /**
     * Encrypt a group message under this device's send chain.
     * @returns the envelope, or `null` when this chat cannot be sealed (the caller
     *          should then send in the clear).
     */
    static async encryptGroupMessage(
        chat: Chat,
        myUserId: string,
        plaintext: string
    ): Promise<string | null> {
        if (!GroupE2EEService.isGroupChat(chat)) return null;
        if (!plaintext) return null;
        if (plaintext.length > 10000) return null;

        let state = await GroupE2EEService.getSelfState(chat.id);
        if (!state) return null;

        let chain: Uint8Array<ArrayBuffer>;
        try {
            chain = CryptoService.hexToBytes(state.chain_key_hex);
        } catch {
            return null;
        }

        const iteration = state.iteration;
        let step;
        try {
            step = await CryptoService.ratchetStep(chain);
        } catch {
            return null;
        }

        const envelope = await CryptoService.sealGroupMessage({
            plaintext,
            senderId: myUserId,
            iteration,
            messageKey: step.messageKey,
        });

        // Persist the advanced chain *and* the message key just used. The message key
        // is unrecoverable later (the chain it came from is discarded), so without
        // this the device could not decrypt its own sent history after a reload.
        const sentKeys = { ...state.sent_keys, [String(iteration)]: CryptoService.bytesToHex(step.messageKey) };
        const boundedSentKeys = GroupE2EEService.boundKeys(sentKeys, MAX_CACHED_SENT);

        state = {
            ...state,
            chain_key_hex: CryptoService.bytesToHex(step.nextChainKey),
            iteration: iteration + 1,
            sent_keys: boundedSentKeys,
        };
        await offlineStorage.saveSenderKeyState(state);

        return envelope;
    }

    /**
     * Decrypt a group envelope.
     * @returns the plaintext, or `null` when the chain is unknown or the message
     *          cannot be opened (wrong sender, tampered, or too far ahead).
     */
    static async decryptGroupMessage(
        payload: string,
        chatId: string,
        myUserId: string
    ): Promise<string | null> {
        const envelope = CryptoService.parseGroupEnvelope(payload);
        if (!envelope) return null;

        try {
            // Own message: the key was cached at send time.
            if (envelope.s === myUserId) {
                const self = await GroupE2EEService.getSelfState(chatId);
                const hex = self?.sent_keys?.[String(envelope.it)];
                if (!hex) return null;
                return await CryptoService.openGroupMessage(
                    envelope,
                    CryptoService.hexToBytes(hex)
                );
            }

            const state = await GroupE2EEService.getPeerState(chatId, envelope.s);
            if (!state) return null;

            const resolved = await GroupE2EEService.resolveMessageKey(state, envelope.it);
            if (!resolved) return null;

            const plaintext = await CryptoService.openGroupMessage(
                envelope,
                resolved.messageKey
            );

            // Only commit the advanced state once decryption actually succeeded,
            // so a failed attempt cannot desynchronise the chain.
            await offlineStorage.saveSenderKeyState({
                ...state,
                chain_key_hex: resolved.nextChainKeyHex,
                iteration: envelope.it + 1,
                skipped: resolved.skipped,
            } satisfies PeerState);

            return plaintext;
        } catch {
            return null;
        }
    }

    /**
     * Produce the message key for `target`, stepping the chain forward if needed.
     *
     * Returns the message key, the chain key that should replace the stored one
     * (i.e. the key for `target + 1`), and the cache of skipped keys. `null` means
     * the message is unusable: already passed and not cached, or too far ahead.
     */
    private static async resolveMessageKey(
        state: PeerState,
        target: number
    ): Promise<{
        messageKey: Uint8Array<ArrayBuffer>;
        nextChainKeyHex: string;
        skipped: Record<string, string>;
    } | null> {
        if (!Number.isInteger(target) || target < 0) return null;

        const skipped = { ...state.skipped };

        // Already consumed this iteration — usable only if we cached it on the way past.
        if (state.iteration > target) {
            const cached = skipped[String(target)];
            if (!cached) return null;
            delete skipped[String(target)];
            try {
                return {
                    messageKey: CryptoService.hexToBytes(cached),
                    nextChainKeyHex: state.chain_key_hex,
                    skipped,
                };
            } catch {
                return null;
            }
        }

        if (target - state.iteration > MAX_SKIP) return null;

        let chain: Uint8Array<ArrayBuffer>;
        try {
            chain = CryptoService.hexToBytes(state.chain_key_hex);
        } catch {
            return null;
        }

        let current = state.iteration;
        while (current < target) {
            const step = await CryptoService.ratchetStep(chain);
            if (Object.keys(skipped).length < MAX_CACHED_SKIPPED) {
                skipped[String(current)] = CryptoService.bytesToHex(step.messageKey);
            }
            chain = step.nextChainKey;
            current += 1;
        }

        const finalStep = await CryptoService.ratchetStep(chain);
        return {
            messageKey: finalStep.messageKey,
            nextChainKeyHex: CryptoService.bytesToHex(finalStep.nextChainKey),
            skipped,
        };
    }

    /** Keep the newest `max` entries of an iteration→hex map. */
    private static boundKeys(map: Record<string, string>, max: number): Record<string, string> {
        const keys = Object.keys(map);
        if (keys.length <= max) return map;

        const keep = keys
            .map(Number)
            .sort((a, b) => b - a)
            .slice(0, max);
        const out: Record<string, string> = {};
        for (const k of keep) out[String(k)] = map[String(k)];
        return out;
    }
}
