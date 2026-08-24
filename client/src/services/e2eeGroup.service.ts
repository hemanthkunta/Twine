import { CryptoService } from './crypto';

export interface SenderKeyDistribution {
  groupId: string;
  senderId: string;
  chainKeyHex: string;
  iteration: number;
  signingPubKeyHex: string;
}

export class GroupE2EEService {
  // Map of groupId -> senderId -> chainKey
  private static groupSenderKeys: Map<string, Map<string, { chainKey: Uint8Array; iteration: number }>> = new Map();

  // Initialize or rotate my sender key for a group
  static async generateMySenderKey(groupId: string, myUserId: string): Promise<SenderKeyDistribution> {
    const rawChainKey = window.crypto.getRandomValues(new Uint8Array(32));
    const chainKeyHex = Array.from(rawChainKey).map((b) => b.toString(16).padStart(2, '0')).join('');

    if (!this.groupSenderKeys.has(groupId)) {
      this.groupSenderKeys.set(groupId, new Map());
    }

    this.groupSenderKeys.get(groupId)!.set(myUserId, {
      chainKey: rawChainKey,
      iteration: 0,
    });

    return {
      groupId,
      senderId: myUserId,
      chainKeyHex,
      iteration: 0,
      signingPubKeyHex: CryptoService.getPublicKey(),
    };
  }

  // Ingest a peer's Sender Key distribution message
  static ingestPeerSenderKey(dist: SenderKeyDistribution) {
    if (!this.groupSenderKeys.has(dist.groupId)) {
      this.groupSenderKeys.set(dist.groupId, new Map());
    }

    const rawChainKey = new Uint8Array(dist.chainKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)));
    this.groupSenderKeys.get(dist.groupId)!.set(dist.senderId, {
      chainKey: rawChainKey,
      iteration: dist.iteration,
    });
  }

  // Encrypt a group message using the Sender Key Ratchet
  static async encryptGroupMessage(
    groupId: string,
    myUserId: string,
    plaintext: string
  ): Promise<{ ciphertext: string; nonce: string; iteration: number }> {
    let groupMap = this.groupSenderKeys.get(groupId);
    if (!groupMap || !groupMap.has(myUserId)) {
      await this.generateMySenderKey(groupId, myUserId);
      groupMap = this.groupSenderKeys.get(groupId)!;
    }

    const state = groupMap.get(myUserId)!;
    
    // Derive message encryption key from chainKey: MessageKey = HMAC-SHA256(chainKey, 0x01)
    const encoder = new TextEncoder();
    const hmacKey = await window.crypto.subtle.importKey(
      'raw',
      state.chainKey as any,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const messageKeyBuffer = await window.crypto.subtle.sign('HMAC', hmacKey, encoder.encode(`msg_key_${state.iteration}`));
    const nextChainKeyBuffer = await window.crypto.subtle.sign('HMAC', hmacKey, encoder.encode('next_chain_key'));

    // Advance chain key ratchet (Forward Secrecy)
    state.chainKey = new Uint8Array(nextChainKeyBuffer);
    const currentIteration = state.iteration;
    state.iteration += 1;

    // Encrypt payload with AES-256-GCM using derived MessageKey
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await window.crypto.subtle.importKey(
      'raw',
      new Uint8Array(messageKeyBuffer).slice(0, 32) as any,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encoder.encode(plaintext)
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      nonce: btoa(String.fromCharCode(...iv)),
      iteration: currentIteration,
    };
  }

  // Decrypt a group message using the sender's ratchet state
  static async decryptGroupMessage(
    groupId: string,
    senderId: string,
    ciphertextBase64: string,
    nonceBase64: string,
    iteration: number
  ): Promise<string> {
    try {
      const groupMap = this.groupSenderKeys.get(groupId);
      if (!groupMap || !groupMap.has(senderId)) {
        return await CryptoService.decrypt(ciphertextBase64, nonceBase64);
      }

      const state = groupMap.get(senderId)!;
      const encoder = new TextEncoder();
      const hmacKey = await window.crypto.subtle.importKey(
        'raw',
        state.chainKey as any,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const messageKeyBuffer = await window.crypto.subtle.sign('HMAC', hmacKey, encoder.encode(`msg_key_${iteration}`));
      const aesKey = await window.crypto.subtle.importKey(
        'raw',
        new Uint8Array(messageKeyBuffer).slice(0, 32) as any,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const iv = new Uint8Array(atob(nonceBase64).split('').map((c) => c.charCodeAt(0)));
      const encryptedBytes = new Uint8Array(atob(ciphertextBase64).split('').map((c) => c.charCodeAt(0)));

      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        encryptedBytes
      );

      return new TextDecoder().decode(decrypted);
    } catch {
      return await CryptoService.decrypt(ciphertextBase64, nonceBase64);
    }
  }
}
