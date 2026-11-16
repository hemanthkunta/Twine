import api from './api';
import {
  bytesToHex,
  hexToBytes,
  openGroupMessage,
  openSenderKey,
  parseGroupEnvelope,
  ratchetStep,
  sealGroupMessage,
  sealSenderKey,
} from './crypto';
import { randomBytes } from './cryptoPolyfill';
import { IdentityService } from './identity';
import { SignalStore } from './signalStore';
import { Chat } from '../types';

/**
 * Group E2EE via sender keys.
 *
 * A group has no single shared secret — if it did, every member could
 * impersonate every other. Instead each member mints their **own** chain key
 * (their "sender key") and distributes one copy to each other member, sealed
 * to that recipient's identity key. Messages are then encrypted under the
 * sender's own ratchet, so a member can only ever produce messages as
 * themselves.
 *
 * The ratchet, the envelope format and the distribution protocol are the same
 * as the browser client's (`client/src/services/e2eeGroup.service.ts`), so a
 * mobile member and a browser member can read each other's group messages.
 */

const MAX_SKIP = 200;
const MAX_CACHED_SKIPPED = 200;
const MAX_CACHED_SENT = 200;

export class GroupE2EEService {
  /** Group chats are the only conversations this service handles. */
  static isGroupChat(chat: Chat | null | undefined): boolean {
    return Boolean(
      chat &&
        (chat.type === 'GROUP' || chat.type === 'SUPERGROUP') &&
        !chat.is_saved_messages,
    );
  }

  /**
   * Make sure this device can send and receive in a group.
   *
   * Steps, all idempotent:
   *  1. read the member list
   *  2. mint a sender key if absent, or **rotate** it if the membership changed
   *  3. upload a sealed copy for every member whose copy we are missing
   *  4. fetch and ingest the copies addressed to us
   */
  static async ensureKeysForChat(chat: Chat, myUserId: string): Promise<void> {
    if (!GroupE2EEService.isGroupChat(chat) || !myUserId) return;

    const members = await api.getChatMembers(chat.id);
    const memberIds = (members?.members ?? [])
      .map((member) => member.user_id)
      .filter((id): id is string => Boolean(id));

    if (memberIds.length === 0) return;

    const state = await SignalStore.getGroupSelfState(chat.id);

    // Including this device, so its own history can be read back after a reload.
    const recipients = Array.from(new Set([...memberIds, myUserId]));

    const membershipChanged =
      !state ||
      [...state.distributedTo].sort().join() !== [...recipients].sort().join();

    let active = state;
    let rotate = false;
    if (!state || membershipChanged) {
      // A fresh chain key. On first use that is simply setup; on a membership
      // change it is a rotation, and `distributedTo` is reset so every member
      // gets the new chain (and the removed one gets nothing).
      rotate = Boolean(state);
      active = {
        chainKeyHex: bytesToHex(randomBytes(32)),
        iteration: 0,
        distributedTo: [],
        sentKeys: {},
      };
      await SignalStore.putGroupSelfState(chat.id, active);
    }

    const remote = await api.getSenderKeys(chat.id);

    const alreadyDistributed = new Set(
      rotate ? [] : remote?.my_recipients?.length ? remote.my_recipients : active.distributedTo,
    );

    const uploads: Array<{ recipientId: string; wrappedKey: string }> = [];

    for (const recipientId of recipients) {
      if (alreadyDistributed.has(recipientId)) continue;

      const peerKey =
        recipientId === myUserId
          ? IdentityService.getPublicKey()
          : await IdentityService.identityKeyOf(recipientId);
      if (!peerKey) continue;

      const sharedKey = await IdentityService.deriveSharedKey(peerKey);
      const wrappedKey = sealSenderKey(
        {
          chatId: chat.id,
          senderId: myUserId,
          chainKeyHex: active.chainKeyHex,
          iteration: active.iteration,
        },
        sharedKey,
      );
      uploads.push({ recipientId, wrappedKey });
    }

    if (uploads.length > 0) {
      await api.publishSenderKeys(
        chat.id,
        uploads,
      );
      active = {
        ...active,
        distributedTo: Array.from(
          new Set([...active.distributedTo, ...uploads.map((u) => u.recipientId)]),
        ),
      };
      await SignalStore.putGroupSelfState(chat.id, active);
    }

    // Ingest the chains addressed to this device.
    for (const entry of remote?.keys ?? []) {
      if (entry.sender_id === myUserId) continue;

      const existing = await SignalStore.getGroupPeerState(chat.id, entry.sender_id);
      const senderKey = await IdentityService.identityKeyOf(entry.sender_id);
      if (!senderKey) continue;

      const sharedKey = await IdentityService.deriveSharedKey(senderKey);
      const opened = openSenderKey(entry.wrapped_key, sharedKey);
      if (!opened) continue;

      // Bind the contents to the row they arrived in, so a wrap cannot be
      // replayed into a different chat or attributed to a different sender.
      if (opened.chatId !== chat.id || opened.senderId !== entry.sender_id) continue;

      // Replace an existing chain only when the sender has clearly restarted
      // (iteration 0 with different key material). Otherwise the local copy is
      // further along than the published one and must not be rewound.
      const isRotation =
        opened.iteration === 0 && existing?.chainKeyHex !== opened.chainKeyHex;
      if (existing && !isRotation) continue;

      await SignalStore.putGroupPeerState(chat.id, entry.sender_id, {
        chainKeyHex: opened.chainKeyHex,
        iteration: opened.iteration,
        skipped: {},
      });
    }
  }

  /**
   * Encrypt a group message under this device's send chain.
   * Returns `null` when the chat cannot be sealed.
   */
  static async encryptGroupMessage(
    chat: Chat,
    myUserId: string,
    plaintext: string,
  ): Promise<string | null> {
    if (!GroupE2EEService.isGroupChat(chat)) return null;
    if (!plaintext) return null;
    if (plaintext.length > 10000) return null;

    const state = await SignalStore.getGroupSelfState(chat.id);
    if (!state) return null;

    let chain: Uint8Array;
    try {
      chain = hexToBytes(state.chainKeyHex);
    } catch {
      return null;
    }

    const iteration = state.iteration;
    let step: { messageKey: Uint8Array; nextChainKey: Uint8Array };
    try {
      step = ratchetStep(chain);
    } catch {
      return null;
    }

    const envelope = sealGroupMessage({
      plaintext,
      senderId: myUserId,
      iteration,
      messageKey: step.messageKey,
    });

    // Persist the advanced chain *and* the message key just used. The message
    // key is unrecoverable later (the chain it came from is discarded), so
    // without this the device could not decrypt its own sent history after a
    // reload.
    const sentKeys = {
      ...state.sentKeys,
      [String(iteration)]: bytesToHex(step.messageKey),
    };

    await SignalStore.putGroupSelfState(chat.id, {
      ...state,
      chainKeyHex: bytesToHex(step.nextChainKey),
      iteration: iteration + 1,
      sentKeys: GroupE2EEService.boundKeys(sentKeys, MAX_CACHED_SENT),
    });

    return envelope;
  }

  /**
   * Decrypt a group envelope.
   * Returns `null` when the chain is unknown or the message cannot be opened.
   */
  static async decryptGroupMessage(
    payload: string,
    chatId: string,
    myUserId: string,
  ): Promise<string | null> {
    const envelope = parseGroupEnvelope(payload);
    if (!envelope) return null;

    try {
      // Own message: the key was cached at send time.
      if (envelope.s === myUserId) {
        const self = await SignalStore.getGroupSelfState(chatId);
        const hex = self?.sentKeys?.[String(envelope.it)];
        if (!hex) return null;
        return openGroupMessage(envelope, hexToBytes(hex));
      }

      const state = await SignalStore.getGroupPeerState(chatId, envelope.s);
      if (!state) return null;

      const resolved = await GroupE2EEService.resolveMessageKey(state, envelope.it);
      if (!resolved) return null;

      const plaintext = openGroupMessage(envelope, resolved.messageKey);

      // Only commit the advanced state once decryption actually succeeded,
      // so a failed attempt cannot desynchronise the chain.
      await SignalStore.putGroupPeerState(chatId, envelope.s, {
        chainKeyHex: resolved.nextChainKeyHex,
        iteration: envelope.it + 1,
        skipped: resolved.skipped,
      });

      return plaintext;
    } catch {
      return null;
    }
  }

  /**
   * Produce the message key for `target`, stepping the chain forward if needed.
   */
  private static async resolveMessageKey(
    state: { chainKeyHex: string; iteration: number; skipped: Record<string, string> },
    target: number,
  ): Promise<{
    messageKey: Uint8Array;
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
          messageKey: hexToBytes(cached),
          nextChainKeyHex: state.chainKeyHex,
          skipped,
        };
      } catch {
        return null;
      }
    }

    if (target - state.iteration > MAX_SKIP) return null;

    let chain: Uint8Array;
    try {
      chain = hexToBytes(state.chainKeyHex);
    } catch {
      return null;
    }

    let current = state.iteration;
    while (current < target) {
      const step = ratchetStep(chain);
      if (Object.keys(skipped).length < MAX_CACHED_SKIPPED) {
        skipped[String(current)] = bytesToHex(step.messageKey);
      }
      chain = step.nextChainKey;
      current += 1;
    }

    const finalStep = ratchetStep(chain);
    return {
      messageKey: finalStep.messageKey,
      nextChainKeyHex: bytesToHex(finalStep.nextChainKey),
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
    for (const key of keep) out[String(key)] = map[String(key)];
    return out;
  }
}

export default GroupE2EEService;
