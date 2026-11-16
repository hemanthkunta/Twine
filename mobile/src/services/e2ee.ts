import api from './api';
import { base64ToBytes, bytesToBase64, parseGroupEnvelope, utf8Decode, utf8Encode } from './crypto';
import { GroupE2EEService } from './e2eeGroup.service';
import { IdentityService } from './identity';
import { SignalClientService } from './signalClient';
import { Chat, Message } from '../types';

/**
 * Orchestrates E2EE on top of the Signal Protocol library and the `/keys`
 * directory.
 *
 * Two mechanisms, chosen by chat type:
 *  - **Direct** — Signal Protocol Double Ratchet per device pair.
 *  - **Group** — per-sender ratchets, distributed as sealed copies.
 *
 * Both match the browser client's construction byte for byte, so a mobile
 * client and the browser client can exchange encrypted messages.
 */

/** Returned instead of a ciphertext when the chat is not E2EE-enabled. */
export const PLAINTEXT_MARKER = '__PLAINTEXT__';

export class E2EEService {
  private static opening = new Map<string, Promise<void>>();

  /** Drop cached lookups (logout / account switch). */
  static reset(): void {
    SignalClientService.reset();
    IdentityService.reset();
    E2EEService.opening.clear();
  }

  /**
   * Publish this device's key material.
   *
   * Idempotent: the pre-key bundle is refreshed (new one-time pre-keys) and
   * the identity key is republished unchanged.
   */
  static async ensureIdentityPublished(userId: string, deviceId: number): Promise<void> {
    const publicKey = await IdentityService.ensureIdentityKey(userId);
    await api.publishPublicKey(publicKey);
    await SignalClientService.publishPreKeyBundle(userId, deviceId);
  }

  /** Direct chats between two humans are the only sealable conversations. */
  static isSealable(chat: Chat | null | undefined): boolean {
    return Boolean(
      chat &&
        chat.type === 'DIRECT' &&
        chat.peer_user?.id &&
        !chat.is_saved_messages,
    );
  }

  /** Whether this chat is one we can actually seal. */
  static canSeal(chat: Chat | null | undefined): boolean {
    if (GroupE2EEService.isGroupChat(chat)) return true;
    return E2EEService.isSealable(chat);
  }

  /**
   * Seal an outgoing body for a chat.
   *
   * @returns the envelope (base64), or {@link PLAINTEXT_MARKER} when the chat
   *          is not E2EE-enabled and plaintext is therefore correct.
   * @throws if encryption fails for an E2EE-eligible chat (fail closed).
   */
  static async sealForChat(
    text: string,
    chat: Chat | null | undefined,
    myUserId: string,
    myDeviceId: number,
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
      // Not an E2EE conversation: plaintext is the correct thing to send.
      return PLAINTEXT_MARKER;
    }

    const peerId = chat!.peer_user!.id;
    if (peerId === myUserId) {
      throw new Error('Cannot send message to self');
    }

    const peerDevices = await SignalClientService.listDevices(peerId);
    if (peerDevices.length === 0) {
      throw new Error('Peer has no active devices');
    }

    const store = SignalClientService.getStore(myUserId, myDeviceId);

    for (const peerDevice of peerDevices) {
      const remoteIdentityKey = await SignalClientService.getRemoteIdentityKey(
        peerId,
        peerDevice.deviceId,
      );
      if (!remoteIdentityKey) {
        throw new Error(`Peer identity key not available for device ${peerDevice.deviceId}`);
      }

      const trusted = await store.isTrustedIdentity(
        `${peerId}:${peerDevice.deviceId}`,
        remoteIdentityKey,
        1,
      );
      if (!trusted) {
        throw new Error(
          `Peer device ${peerDevice.deviceId} identity not verified. Please verify the safety number before sending messages.`,
        );
      }
    }

    try {
      const libsignal = await import('libsignal-protocol-typescript');
      const envelopes: Array<{ deviceId: number; envelope: string }> = [];
      for (const peerDevice of peerDevices) {
        await SignalClientService.ensureSession(
          myUserId,
          myDeviceId,
          peerId,
          peerDevice.deviceId,
        );
        const remoteAddress = new libsignal.SignalProtocolAddress(
          peerId,
          peerDevice.deviceId,
        );
        const envelope = await SignalClientService.encrypt(
          myUserId,
          myDeviceId,
          remoteAddress,
          text,
        );
        envelopes.push({ deviceId: peerDevice.deviceId, envelope });
      }
      const payload = JSON.stringify({
        type: 'multi_device',
        senderDeviceId: myDeviceId,
        envelopes,
      });
      return bytesToBase64(utf8Encode(payload));
    } catch (err) {
      console.error('E2EE: Signal sealing failed', err);
      throw new Error('Failed to encrypt message');
    }
  }

  /**
   * Open a sealed message in place, writing the result to `content_text`.
   */
  static async decryptIncoming(
    message: Message,
    myUserId: string,
    myDeviceId: number,
    peerUserId?: string | null,
    chat?: Chat | null,
  ): Promise<void> {
    const payload = message.ciphertext_payload;
    if (!payload || message.content_text) return;

    const key = `${myUserId}:${myDeviceId}:${message.id}:${payload}`;
    let pending = E2EEService.opening.get(key);
    if (!pending) {
      pending = E2EEService.decryptIncomingOnce(
        message,
        myUserId,
        myDeviceId,
        peerUserId,
        chat,
      ).finally(() => E2EEService.opening.delete(key));
      E2EEService.opening.set(key, pending);
    }
    await pending;
  }

  private static async decryptIncomingOnce(
    message: Message,
    myUserId: string,
    myDeviceId: number,
    peerUserId?: string | null,
    chat?: Chat | null,
  ): Promise<void> {
    const payload = message.ciphertext_payload;
    if (!payload || message.content_text) return;

    // Group messages carry their own sender and ratchet iteration, so they take
    // a different path and never touch the peer-key lookup below.
    if (parseGroupEnvelope(payload)) {
      let plain = await GroupE2EEService.decryptGroupMessage(
        payload,
        message.chat_id,
        myUserId,
      );

      if (plain === null && chat) {
        // Usual cause: the sender's chain reached the server after this
        // message did, so we have not ingested it yet. Fetch, then retry once.
        try {
          await GroupE2EEService.ensureKeysForChat(chat, myUserId);
          plain = await GroupE2EEService.decryptGroupMessage(
            payload,
            message.chat_id,
            myUserId,
          );
        } catch {
          // Fall through to the placeholder below.
        }
      }

      message.content_text = plain ?? '[Encrypted message — key unavailable]';
      return;
    }

    const keyOwnerId = message.sender_id === myUserId ? peerUserId : message.sender_id;
    if (!keyOwnerId) {
      message.content_text = '[Encrypted message]';
      return;
    }

    if (message.sender_id === myUserId) {
      message.content_text = '[Encrypted message — local history unavailable]';
      return;
    }

    let envelopeData: any = null;
    try {
      envelopeData = JSON.parse(utf8Decode(base64ToBytes(payload)));
    } catch {
      envelopeData = null;
    }

    let currentPayload = payload;
    let senderDeviceId = 1;
    if (envelopeData && envelopeData.type === 'multi_device' && envelopeData.envelopes) {
      senderDeviceId =
        Number.isInteger(envelopeData.senderDeviceId) && envelopeData.senderDeviceId > 0
          ? envelopeData.senderDeviceId
          : 1;
      const myEnvelope = envelopeData.envelopes.find(
        (entry: { deviceId: number }) => entry.deviceId === myDeviceId,
      );
      if (!myEnvelope) {
        message.content_text = '[No envelope for this device]';
        return;
      }
      currentPayload = myEnvelope.envelope;
    } else if (envelopeData && [1, 3].includes(envelopeData.type)) {
      senderDeviceId = 1;
    }

    try {
      const parsed = JSON.parse(utf8Decode(base64ToBytes(currentPayload)));
      if (![1, 3].includes(parsed.type) || !Array.isArray(parsed.body)) {
        throw new Error('Invalid envelope');
      }
    } catch {
      message.content_text = '[Unable to decrypt this message]';
      return;
    }

    try {
      const libsignal = await import('libsignal-protocol-typescript');
      const remoteAddress = new libsignal.SignalProtocolAddress(
        keyOwnerId,
        senderDeviceId,
      );

      const remoteIdentityKey = await SignalClientService.getRemoteIdentityKey(
        keyOwnerId,
        senderDeviceId,
      );
      if (!remoteIdentityKey) {
        message.content_text = '[Untrusted identity — no public key]';
        return;
      }

      const store = SignalClientService.getStore(myUserId, myDeviceId);
      const trusted = await store.isTrustedIdentity(
        `${keyOwnerId}:${senderDeviceId}`,
        remoteIdentityKey,
        0,
      );
      if (!trusted) {
        message.content_text = '[Untrusted identity — message not decrypted]';
        return;
      }

      message.content_text = await SignalClientService.decrypt(
        myUserId,
        myDeviceId,
        remoteAddress,
        currentPayload,
      );
    } catch {
      // Stale session, tampered ciphertext, or rotated identity key.
      message.content_text = '[Unable to decrypt this message]';
    }
  }

  /** Open a batch of messages, e.g. loaded history. */
  static async decryptAll(
    messages: Message[],
    myUserId: string,
    myDeviceId: number,
    peerUserId?: string | null,
    chat?: Chat | null,
  ): Promise<Message[]> {
    await Promise.all(
      messages.map((message) =>
        E2EEService.decryptIncoming(message, myUserId, myDeviceId, peerUserId, chat),
      ),
    );
    return messages;
  }
}

export default E2EEService;
