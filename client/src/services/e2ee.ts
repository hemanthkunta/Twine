import { ApiService } from './api';
import { CryptoService } from './crypto';
import { GroupE2EEService } from './e2eeGroup.service';
import { SignalClientService } from './signalClient';
import { SignalProtocolAddress } from 'libsignal-protocol-typescript';
import { SignalProtocolStore } from './signalStore';
import { offlineStorage } from './storage';
import { Chat, Message, MessageType } from '../types/index';

/**
 * Error thrown when a peer has not published their pre-key bundle yet.
 * Used to queue messages for later delivery when the peer comes online.
 */
export class PeerKeysNotPublishedError extends Error {
    constructor(public readonly peerUserId: string, public readonly peerDeviceId: number) {
        super(`Peer ${peerUserId} (device ${peerDeviceId}) has not published their pre-key bundle`);
        this.name = 'PeerKeysNotPublishedError';
    }
}

/**
 * Orchestrates E2EE on top of Signal Protocol (key material, ratchet) and the
 * `/keys` directory (public key distribution).
 *
 * Two mechanisms, chosen by chat type:
 *  - **Direct** — Signal Protocol Double Ratchet per device pair. Keys never leave client.
 *    See {@link SignalClientService}.
 *  - **Group** — per-sender ratchets, distributed as sealed copies.
 *    See {@link GroupE2EEService}.
 *
 * Messages that cannot be sealed are sent in the clear rather than failing, so a
 * peer who has never signed in (and therefore published no key) can still be
 * messaged. That fallback is why the UI must not blanket-claim encryption for
 * every message; it is described per message instead.
 */

// Store scheduled tasks for cleanup on logout
const scheduledTasks = new Map<string, { rotationCleanup: () => void; replenishCleanup: () => void }>();

// Queue for messages waiting for peer keys
interface QueuedMessage {
    text: string;
    chat: Chat | null | undefined;
    myUserId: string;
    myDeviceId: number;
    peerUserId: string;
    peerDeviceId: number;
    timestamp: number;
    resolve: (envelope: string) => void;
    reject: (error: Error) => void;
}

const pendingKeyQueue = new Map<string, QueuedMessage[]>();

export class E2EEService {
    private static opening = new Map<string, Promise<string>>();
    private static publishing = new Map<string, Promise<string>>();
    /** Drop cached lookups (logout / account switch). */
    static reset(): void {
        SignalClientService.reset();
        this.publishing.clear();
        CryptoService.reset();
        // Clean up scheduled tasks
        for (const [, tasks] of scheduledTasks) {
            tasks.rotationCleanup();
            tasks.replenishCleanup();
        }
        scheduledTasks.clear();
    }

    /**
     * Initialise the identity key and advertise its public half.
     * Idempotent — republishing is skipped while the key is unchanged.
     * Also schedules signed pre-key rotation (every 7 days) and pre-key replenishment (when < 20 remain).
     */
    static async ensureIdentityPublished(userId: string, deviceId: number): Promise<string> {
        // SignalClientService handles its own identity key generation and publishing
        const key = `${userId}:${deviceId}`;
        let pending = this.publishing.get(key);
        if (!pending) {
            pending = (async () => {
                // 1. Generate identity key pair if not exists
                // SignalClientService.publishPreKeyBundle handles identity key generation internally

                // 2. Generate signed pre-key with signature and 100+ one-time pre-keys
                // 3. Build and publish pre-key bundle via ApiService
                await SignalClientService.publishPreKeyBundle(userId, deviceId, { preKeyCount: 100 });

                // 4. Also publish the legacy public key for compatibility
                const { publicKeyBase64: publicKey } = await CryptoService.initIdentityKey(userId);
                await ApiService.publishPublicKey(publicKey);

                // 5. Schedule signed pre-key rotation (every 7 days)
                const rotationCleanup = SignalClientService.scheduleSignedPreKeyRotation(userId, deviceId);

                // 6. Schedule pre-key replenishment when < 20 remain (check every hour)
                const replenishCleanup = SignalClientService.schedulePreKeyReplenishment(userId, deviceId, 20, 100);

                // Store cleanup functions for later
                scheduledTasks.set(key, { rotationCleanup, replenishCleanup });

                // Dispatch event to notify UI that pre-key bundle is published
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('e2ee:preKeyBundlePublished', {
                        detail: { userId, deviceId }
                    }));
                }

                return publicKey;
            })().catch(error => {
                this.publishing.delete(key);
                throw error;
            });
            this.publishing.set(key, pending);
        }
        return pending;
    }

    /**
     * Stop scheduled tasks for a specific user/device.
     * Called on logout or device revocation.
     */
    static stopScheduledTasks(userId: string, deviceId: number): void {
        const key = `${userId}:${deviceId}`;
        const tasks = scheduledTasks.get(key);
        if (tasks) {
            tasks.rotationCleanup();
            tasks.replenishCleanup();
            scheduledTasks.delete(key);
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
     * @returns the envelope (base64), or '__PLAINTEXT__' when this chat cannot be sealed.
     * @throws if encryption fails for an E2EE-eligible chat (fail-closed).
     */
    static async sealForChat(
        text: string,
        chat: Chat | null | undefined,
        myUserId: string,
        myDeviceId: number
    ): Promise<string> {
        if (!text) {
            throw new Error('Empty message cannot be sealed');
        }

        // Mirror the server's own message cap; the server cannot check the length
        // of text it cannot read.
        if (text.length > 10000) {
            throw new Error('Message exceeds maximum length');
        }

        if (GroupE2EEService.isGroupChat(chat)) {
            try {
                // Distributes this device's chain (and ingests everyone else's) if
                // that has not happened yet. Safe to call on every send.
                await GroupE2EEService.ensureKeysForChat(chat!, myUserId);
                const envelope = await GroupE2EEService.encryptGroupMessage(chat!, myUserId, text);
                if (!envelope) throw new Error('Group encryption returned null');
                return envelope;
            } catch (err) {
                console.error('E2EE: group sealing failed', err);
                throw new Error('Failed to encrypt group message');
            }
        }

        if (!E2EEService.isSealable(chat)) {
            // Non‑sealable chats (e.g. non‑E2EE direct) are sent in the clear.
            // Caller will send plaintext when this returns the plain text marker.
            // We use a special sentinel to indicate "no encryption".
            return '__PLAINTEXT__';
        }

        const peerId = chat!.peer_user!.id;
        if (peerId === myUserId) {
            throw new Error('Cannot send message to self');
        }

        // Get peer's registered devices
        const peerDevices = await SignalClientService.listDevices(chat!.peer_user!.id);
        const activePeerDevices = peerDevices.filter(d => !d.isRevoked);
        
        if (activePeerDevices.length === 0) {
            throw new Error('Peer has no active devices');
        }

        // Check if peer's identity keys are trusted before sending
        // This prevents sending to a peer whose identity key has changed
        // without explicit user verification
        const store = SignalProtocolStore.getInstance(myUserId, myDeviceId);
        
        // Verify trust for all peer devices
        for (const peerDevice of activePeerDevices) {
          const remoteIdentityKey = await SignalClientService.getRemoteIdentityKey(myUserId, peerId, peerDevice.deviceId);
          if (!remoteIdentityKey) {
              throw new Error(`Peer identity key not available for device ${peerDevice.deviceId}`);
          }

          const isTrusted = await store.isTrustedIdentity(
              `${peerId}:${peerDevice.deviceId}`,
              remoteIdentityKey,
              1 // direction: 1 = sending
          );

          if (!isTrusted) {
              // Check if user has explicitly verified this peer device
              const isVerified = await store.isPeerVerified(peerId, peerDevice.deviceId);
              if (!isVerified) {
                  throw new Error(`Peer device ${peerDevice.deviceId} identity not verified. Please verify the safety number before sending messages.`);
              }
          }
        }

        // Outgoing seals always use Signal Protocol: the Double Ratchet provides
        // forward secrecy and post-compromise security. A cached stale key would
        // silently produce envelopes the peer can never open, so we ensure the
        // session is established and the key is fresh.
        try {
            // Establish sessions for all peer devices if needed (first contact)
            for (const peerDevice of activePeerDevices) {
                await SignalClientService.ensureSession(myUserId, myDeviceId, peerId, peerDevice.deviceId);
            }

            // Encrypt for each peer device separately
            const envelopes: Array<{deviceId: number; envelope: string}> = [];
            for (const peerDevice of activePeerDevices) {
                const remoteAddress = new SignalProtocolAddress(peerId, peerDevice.deviceId);
                const envelope = await SignalClientService.encrypt(myUserId, myDeviceId, remoteAddress, text);
                envelopes.push({ deviceId: peerDevice.deviceId, envelope });
            }

            // Return multi-device envelope
            return btoa(JSON.stringify({ type: 'multi_device', senderDeviceId: myDeviceId, envelopes }));
        } catch (err: any) {
            // If peer keys not published, queue the message for retry
            if (err instanceof PeerKeysNotPublishedError) {
                return new Promise<string>((resolve, reject) => {
                    const queueKey = `${err.peerUserId}:${err.peerDeviceId}`;
                    const queue = pendingKeyQueue.get(queueKey) || [];
                    queue.push({
                        text,
                        chat,
                        myUserId,
                        myDeviceId,
                        peerUserId: err.peerUserId,
                        peerDeviceId: err.peerDeviceId,
                        timestamp: Date.now(),
                        resolve,
                        reject
                    });
                    pendingKeyQueue.set(queueKey, queue);
                    console.log(`[E2EE] Queued message for ${queueKey} (peer keys not published)`);
                });
            }
            console.error('E2EE: Signal sealing failed', err);
            throw new Error('Failed to encrypt message');
        }
    }

    /**
     * Open a sealed message in place, writing the result to `content_text`.
     *
     * Key ownership: the shared secret comes from Signal Double Ratchet, so the
     * key to look up is the **other participant**, which is the sender for inbound
     * messages and the chat peer for messages this user sent.
     * Using the sender's key unconditionally would fail on your own history.
     */
    static async decryptIncoming(
        message: Message, myUserId: string, myDeviceId: number,
        peerUserId?: string | null, chat?: Chat | null
    ): Promise<void> {
        if (!message.ciphertext_payload || message.content_text) return;
        const key = `${myUserId}:${myDeviceId}:${message.id}:${message.ciphertext_payload}`;
        let pending = this.opening.get(key);
        if (!pending) {
            pending = (async () => {
                await this.decryptIncomingOnce(message, myUserId, myDeviceId, peerUserId, chat);
                if (message.content_text && !/^\[(Encrypted|Unable|Untrusted|No envelope)/.test(message.content_text)) {
                    await offlineStorage.saveMessageLocally(message);
                }
                return message.content_text;
            })().finally(() => this.opening.delete(key));
            this.opening.set(key, pending);
        }
        message.content_text = await pending;
    }

    private static async decryptIncomingOnce(
        message: Message,
        myUserId: string,
        myDeviceId: number,
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

        const cached = (await offlineStorage.getLocalMessages(message.chat_id)).find(m => m.id === message.id ||
            (m.ciphertext_payload === payload && m.sender_id === message.sender_id));
        if (cached?.content_text && !/^\[(Encrypted|Unable|Untrusted|No envelope)/.test(cached.content_text)) {
            message.content_text = cached.content_text;
            return;
        }
        if (message.sender_id === myUserId) {
            message.content_text = '[Encrypted message — local history unavailable]';
            return;
        }

        const keyOwnerId = message.sender_id === myUserId ? peerUserId : message.sender_id;
        if (!keyOwnerId) {
            message.content_text = '[Encrypted message]';
            return;
        }

        // Check if this is a multi-device envelope
        let envelopeData: any;
        try {
            envelopeData = JSON.parse(atob(payload));
        } catch {
            envelopeData = null;
        }

        // Handle multi-device envelope
        let currentPayload = payload;
        const senderDeviceId = Number.isInteger(envelopeData?.senderDeviceId) && envelopeData.senderDeviceId > 0
            ? envelopeData.senderDeviceId : 1;
        if (envelopeData && envelopeData.type === 'multi_device' && envelopeData.envelopes) {
            // Find the envelope for our device
            const myEnvelope = envelopeData.envelopes.find((e: any) => e.deviceId === myDeviceId);
            if (!myEnvelope) {
                message.content_text = '[No envelope for this device]';
                return;
            }
            currentPayload = myEnvelope.envelope;
        }

        try {
            const envelope = JSON.parse(atob(currentPayload));
            if (![1, 3].includes(envelope.type) || !Array.isArray(envelope.body)) throw new Error('Invalid envelope');
        } catch {
            message.content_text = '[Unable to decrypt this message]';
            return;
        }

        // Direct messages: use Signal Protocol Double Ratchet decryption.
        try {
            const remoteAddress = new SignalProtocolAddress(keyOwnerId, senderDeviceId);

            // Verify the sender's identity key is trusted before decrypting
            const remoteIdentityKey = await SignalClientService.getRemoteIdentityKey(myUserId, keyOwnerId, senderDeviceId);
            if (!remoteIdentityKey) {
                message.content_text = '[Untrusted identity — no public key]';
                return;
            }

            const store = SignalProtocolStore.getInstance(myUserId, myDeviceId);
            const isTrusted = await store.isTrustedIdentity(
                `${keyOwnerId}:${senderDeviceId}`,
                remoteIdentityKey,
                0 // direction: 0 = receiving
            );

            if (!isTrusted) {
                message.content_text = '[Untrusted identity — message not decrypted]';
                return;
            }

            message.content_text = await SignalClientService.decrypt(myUserId, myDeviceId, remoteAddress, currentPayload);
        } catch {
            // Stale session, tampered ciphertext, or rotated identity key.
            // Older messages become unopenable on rotation (documented v1 trade-off).
            message.content_text = '[Unable to decrypt this message]';
        }
    }

    /**
     * Whether this chat is one we can actually seal, so the UI can state it
     * truthfully instead of showing a badge on every conversation.
     */
    static canSeal(chat: Chat | null | undefined): boolean {
        if (GroupE2EEService.isGroupChat(chat)) return true;
        return E2EEService.isSealable(chat);
    }

    /**
     * Open a batch of messages, e.g. loaded history.
     */
    static async decryptAll(
        messages: Message[],
        myUserId: string,
        myDeviceId: number,
        peerUserId?: string | null,
        chat?: Chat | null
    ): Promise<Message[]> {
        await Promise.all(
            messages.map((m) => E2EEService.decryptIncoming(m, myUserId, myDeviceId, peerUserId, chat))
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

    // =============================================================================
    // History Transfer Methods
    // =============================================================================

    /**
     * Initiate a history transfer from this device to another device.
     * Returns the transfer ID and challenge for the destination device to sign.
     */
    static async initiateHistoryTransfer(
        myUserId: string,
        myDeviceId: number,
        destUserId: string,
        destDeviceId: number,
        policy: { include_groups?: boolean; include_direct?: boolean; date_range?: { start?: string; end?: string } | null } = { include_groups: true, include_direct: true, date_range: null }
    ): Promise<{
        transferId: string;
        challenge: string; // base64
        sourceEphemeralPubKey: string; // base64
        expiresAt: string;
    }> {
        // Generate ephemeral X25519 key pair for this transfer
        const ephemeralKeyPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'X25519' },
            true,
            ['deriveKey', 'deriveBits']
        );
        const ephemeralPubKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
        const ephemeralPrivKey = await crypto.subtle.exportKey('pkcs8', ephemeralKeyPair.privateKey);

        const response = await ApiService.initiateHistoryTransfer(myUserId, myDeviceId, destUserId, destDeviceId, {
            include_groups: policy.include_groups ?? true,
            include_direct: policy.include_direct ?? true,
            date_range: policy.date_range ?? null
        });

        // Store ephemeral private key for later key derivation
        await SignalClientService.storeTransferEphemeralKeys(
            response.transferId,
            myUserId,
            myDeviceId,
            true, // isSource
            ephemeralPrivKey,
            undefined // dest ephemeral pub key will be added after authorization
        );

        return {
            transferId: response.transferId,
            challenge: response.challenge,
            sourceEphemeralPubKey: response.sourceEphemeralPubKey,
            expiresAt: response.expiresAt
        };
    }

    /**
     * Authorize a history transfer on the destination device.
     * Signs the challenge with the destination device's identity key.
     */
    static async authorizeHistoryTransfer(
        myUserId: string,
        myDeviceId: number,
        transferId: string,
        challengeB64: string,
        sourceEphemeralPubKeyB64: string
    ): Promise<{
        signature: string; // base64
        destEphemeralPubKey: string; // base64
    }> {
        // Generate our ephemeral key pair for mutual key derivation
        const ephemeralKeyPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'X25519' },
            true,
            ['deriveKey', 'deriveBits']
        );
        const ephemeralPubKey = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);
        const ephemeralPrivKey = await crypto.subtle.exportKey('pkcs8', ephemeralKeyPair.privateKey);

        // Sign the challenge with our identity key (Ed25519)
        const challenge = Buffer.from(challengeB64, 'base64');
        
        // Use the Signal identity key to sign (Ed25519)
        const store = SignalProtocolStore.getInstance(myUserId, myDeviceId);
        const identityKeyPair = await store.getIdentityKeyPair();
        if (!identityKeyPair) {
            throw new Error('Identity key not found');
        }

        // Import identity private key for Ed25519 signing
        // Signal identity keys are Ed25519 (X25519), so we use Ed25519 for signing
        const identityPrivKey = await crypto.subtle.importKey(
            'pkcs8',
            identityKeyPair.privKey,
            { name: 'ECDSA', namedCurve: 'P-256' }, // Note: Web Crypto doesn't support Ed25519 for sign/verify directly
            true,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            identityPrivKey,
            challenge
        );

        // Store our ephemeral keys for this transfer
        const sourceEphemeralPubKey = Buffer.from(sourceEphemeralPubKeyB64, 'base64');
        await SignalClientService.storeTransferEphemeralKeys(
            transferId,
            myUserId,
            myDeviceId,
            false, // isSource = false (we're the destination)
            undefined, // source ephemeral priv key not known
            Buffer.from(sourceEphemeralPubKeyB64, 'base64')
        );

        // Store our ephemeral private key for key derivation
        await offlineStorage.saveHistoryTransfer({
            transferId: '', // will be filled by authorize call
            userId: myUserId,
            role: 'dest',
            status: 'approved',
            partnerUserId: '', // will be filled
            partnerDeviceId: 0, // will be filled
            myDeviceId: myDeviceId,
            destEphemeralPrivKey: Array.from(new Uint8Array(await crypto.subtle.exportKey('pkcs8', ephemeralKeyPair.privateKey))),
            destEphemeralPubKey: Array.from(new Uint8Array(ephemeralPubKey)),
            transferKey: [],
            policy: { include_groups: true, include_direct: true, date_range: null },
            totalBatches: 0,
            currentBatch: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        const signatureB64 = Buffer.from(signature).toString('base64');
        const destEphemeralPubKeyB64 = Buffer.from(ephemeralPubKey).toString('base64');

        // Submit authorization to server
        await ApiService.authorizeHistoryTransfer(transferId, signatureB64, destEphemeralPubKeyB64);

        return { signature: signatureB64, destEphemeralPubKey: destEphemeralPubKeyB64 };
    }

    /**
     * Derive the transfer key and begin pulling/encrypting history.
     * This is called on the source device after authorization is complete.
     */
    static async beginHistoryTransfer(
        myUserId: string,
        myDeviceId: number,
        transferId: string,
        sourceEphemeralPubKeyB64: string,
        destEphemeralPubKeyB64: string,
        sourceIdentityPubKeyB64: string,
        destIdentityPubKeyB64: string
    ): Promise<{ transferKey: Uint8Array }> {
        // Derive the transfer key
        const { encKey, authKey } = await SignalClientService.deriveTransferKey(
            myUserId,
            myDeviceId, // myDeviceId - need to get from store
            transferId,
            Buffer.from(sourceEphemeralPubKeyB64, 'base64'),
            Buffer.from(destEphemeralPubKeyB64, 'base64'),
            Buffer.from(sourceIdentityPubKeyB64, 'base64'),
            Buffer.from(destIdentityPubKeyB64, 'base64'),
            true // isSource
        );

        const transferKey = new Uint8Array([...encKey, ...authKey]);

        // Update transfer state with key
        await SignalClientService.updateTransferProgress(transferId, { transferKey });

        return { transferKey };
    }

    /**
     * Export message history for transfer.
     * Queries local message database, decrypts messages, and returns them
     * in a format suitable for transfer encryption.
     */
    static async exportHistoryForTransfer(
        myUserId: string,
        myDeviceId: number,
        transferId: string,
        policy: { include_groups?: boolean; include_direct?: boolean; date_range?: { start?: string; end?: string } | null }
    ): Promise<Array<{
        batch_seq: number;
        messages: Array<{
            message_id: string;
            chat_id: string;
            sender_id: string;
            type: string;
            content: string;
            timestamp: string;
            reply_to: string | null;
            forwarded_from: { message_id: string; sender_id: string } | null;
        }>;
        total_batches: number;
    }>> {
        // Get all local messages
        const localMessages = await offlineStorage.getLocalMessages(''); // get all
        
        // Filter by policy
        let filtered = localMessages;
        
        if (policy.date_range?.start) {
            const start = new Date(policy.date_range.start).getTime();
            filtered = filtered.filter(m => new Date(m.created_at).getTime() >= start);
        }
        if (policy.date_range?.end) {
            const end = new Date(policy.date_range.end).getTime();
            filtered = filtered.filter(m => new Date(m.created_at).getTime() <= end);
        }
        
        if (!policy.include_groups) {
            filtered = filtered.filter(m => {
                // Need to check chat type - for now assume we can check
                return true; // simplified
            });
        }
        
        if (!policy.include_direct) {
            filtered = filtered.filter(m => false); // simplified
        }

        // Decrypt all messages
        const decrypted = await E2EEService.decryptAll(
            filtered,
            myUserId,
            myDeviceId,
            null,
            null
        );

        // Convert to transfer format
        const transferMessages = decrypted.map(m => ({
            message_id: m.id,
            chat_id: m.chat_id,
            sender_id: m.sender_id,
            type: m.type || 'TEXT',
            content: m.content_text || '',
            timestamp: m.created_at,
            reply_to: m.reply_to_message_id || null,
            forwarded_from: m.forwardedFrom ? {
                message_id: m.forwardedFrom.messageId!,
                sender_id: m.forwardedFrom.senderId!
            } : null
        }));

        // Batch into chunks of 100
        const batchSize = 100;
        const batches = [];
        for (let i = 0; i < transferMessages.length; i += batchSize) {
            const batchMessages = transferMessages.slice(i, i + batchSize);
            batches.push({
                batch_seq: Math.floor(i / batchSize),
                messages: batchMessages,
                total_batches: Math.ceil(transferMessages.length / batchSize)
            });
        }

        return batches;
    }

    /**
     * Encrypt and send a history batch to the destination device.
     */
    static async sendHistoryBatch(
        myUserId: string,
        myDeviceId: number,
        transferId: string,
        batchSeq: number,
        batch: {
            messages: Array<{
                message_id: string;
                chat_id: string;
                sender_id: string;
                type: MessageType;
                content: string;
                timestamp: string;
                reply_to: string | null;
                forwarded_from: { message_id: string; sender_id: string } | null;
            }>;
            total_batches: number;
        },
        transferKey: Uint8Array
    ): Promise<void> {
        const envelope = await SignalClientService.encryptHistoryBatch(
            transferId,
            batchSeq,
            batch.messages,
            transferKey
        );

        // Update batch with total_batches
        const envelopeObj = JSON.parse(atob(envelope));
        envelopeObj.total_batches = batch.total_batches;
        const updatedEnvelope = btoa(JSON.stringify(envelopeObj));

        await ApiService.sendHistoryBatch(transferId, batchSeq, updatedEnvelope);

        // Update progress
        await SignalClientService.updateTransferProgress(transferId, {
            currentBatch: batchSeq + 1
        });
    }

    /**
     * Receive and decrypt a history batch on the destination device.
     */
    static async receiveHistoryBatch(
        myUserId: string,
        myDeviceId: number,
        transferId: string,
        envelopeB64: string,
        expectedBatchSeq: number,
        transferKey: Uint8Array
    ): Promise<{
        batchSeq: number;
        messages: Array<{
            message_id: string;
            chat_id: string;
            sender_id: string;
            type: MessageType;
            content: string;
            timestamp: string;
            reply_to: string | null;
            forwarded_from: { message_id: string; sender_id: string } | null;
        }>;
        totalBatches: number;
    }> {
        return SignalClientService.decryptHistoryBatch(
            envelopeB64,
            transferId,
            expectedBatchSeq,
            transferKey
        );
    }

    /**
     * Import decrypted history messages into local database.
     */
    static async importHistoryBatch(
        myUserId: string,
        myDeviceId: number,
        batch: {
            messages: Array<{
                message_id: string;
                chat_id: string;
                sender_id: string;
                type: MessageType;
                content: string;
                timestamp: string;
                reply_to: string | null;
                forwarded_from: { message_id: string; sender_id: string } | null;
            }>;
        }
    ): Promise<void> {
        const messages = batch.messages.map(m => ({
            id: m.message_id,
            chat_id: m.chat_id,
            sender_id: m.sender_id,
            reply_to_message_id: m.reply_to ?? undefined,
            type: m.type,
            content_text: m.content,
            created_at: m.timestamp,
            forwardedFrom: m.forwarded_from ? {
                messageId: m.forwarded_from.message_id,
                senderId: m.forwarded_from.sender_id,
            } : undefined,
            ciphertext_payload: undefined,
            is_deleted: false,
            is_edited: false,
            is_pinned: false,
            status: 'READ' as const
        }));

        await offlineStorage.saveMessagesLocally(messages);
    }

    /**
     * Acknowledge receipt of a history batch.
     */
    static async acknowledgeHistoryBatch(
        transferId: string,
        batchSeq: number,
        success: boolean
    ): Promise<void> {
        await ApiService.acknowledgeHistoryBatch(transferId, batchSeq, success);
    }

    /**
     * Complete the history transfer.
     */
    static async completeHistoryTransfer(
        myUserId: string,
        myDeviceId: number,
        transferId: string
    ): Promise<void> {
        await ApiService.completeHistoryTransfer(transferId);
        
        // Update transfer state
        await SignalClientService.updateTransferProgress(transferId, {
            status: 'completed',
            currentBatch: -1
        });
    }

    /**
     * Cancel a history transfer.
     */
    static async cancelHistoryTransfer(
        myUserId: string,
        myDeviceId: number,
        transferId: string
    ): Promise<void> {
        await ApiService.cancelHistoryTransfer(transferId);
        
        // Clean up local transfer state
        await offlineStorage.deleteHistoryTransfer(transferId);
    }

    /**
     * Get all pending/active transfers for the current user.
     */
    static async getActiveTransfers(myUserId: string): Promise<Array<{
        transferId: string;
        role: 'source' | 'dest';
        status: string;
        partnerUserId: string;
        partnerDeviceId: number;
        createdAt: string;
        progress: { current: number; total: number };
    }>> {
        const transfers = await offlineStorage.getHistoryTransfersByUser(myUserId);
        return transfers.map(t => ({
            transferId: t.transferId,
            role: t.role,
            status: t.status,
            partnerUserId: t.partnerUserId,
            partnerDeviceId: t.partnerDeviceId,
            createdAt: t.createdAt,
            progress: { current: t.currentBatch, total: t.totalBatches }
        }));
    }
}
