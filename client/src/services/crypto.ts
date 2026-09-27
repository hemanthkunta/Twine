import { offlineStorage } from './storage';

const subtle = () => globalThis.crypto.subtle;

const CURVE = 'P-256' as const;
const ECDH_ALGO = { name: 'ECDH', namedCurve: CURVE } as const;

// Domain separation for HKDF. Fixed constants (not secrets) so both peers derive
// the same key from the same ECDH output.
const HKDF_SALT = 'twine-e2ee-v1';
const HKDF_INFO = 'twine-e2ee-p256-chat-key';

interface StoredIdentityKey {
  publicKeyBase64: string;
  /** JWK of the private half. Absent in records written by the pre-E2EE code. */
  privateKeyJwk?: JsonWebKey;
  createdAt?: string;
}

/**
 * A group message envelope.
 *
 * Direct messages (`sealForPeer`) derive their key from the peer's identity key,
 * so the envelope needs nothing but the nonce and ciphertext. A group message is
 * encrypted under a ratchet, so the recipient also needs to know *whose* chain to
 * step and *how far* — hence `s` (sender) and `it` (iteration), and the `g: 1`
 * tag that keeps the two envelope kinds from being confused.
 */
export interface GroupEnvelope {
  v: 1;
  g: 1;
  s: string;
  it: number;
  n: string;
  c: string;
}

/** The contents of a sealed sender-key distribution, opened by one recipient. */
export interface SenderKeyPayload {
  chatId: string;
  senderId: string;
  chainKeyHex: string;
  iteration: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// WebCrypto's BufferSource requires an ArrayBuffer-backed view, whereas the
// generic Uint8Array is typed over ArrayBufferLike (which includes
// SharedArrayBuffer). Both helpers below genuinely return ArrayBuffer-backed
// data, so the narrower return types are accurate rather than a cast.
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function utf8(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
}

export class CryptoService {
  // Only the private half is retained: `deriveBits` needs nothing else, and the
  // public half is exported to base64 at generation time.
  private static localPrivateKey: CryptoKey | null = null;
  private static publicKeyBase64: string | null = null;
  private static readonly sharedKeyCache = new Map<string, CryptoKey>();

  /**
   * Load the user's identity keypair, generating one on first use.
   *
   * The *private* key is persisted (as a JWK) because it is required to derive
   * chat keys after a reload. Storing the public half alone — which is what this
   * service used to do — made every ECDH derivation impossible, so the old
   * "encryption" fell back to a key hardcoded in the bundle.
   */
  static async initIdentityKey(userId: string): Promise<{ publicKeyBase64: string }> {
    const existing = (await offlineStorage.getIdentityKey(userId)) as StoredIdentityKey | null;

    if (existing?.publicKeyBase64 && existing.privateKeyJwk) {
      try {
        CryptoService.localPrivateKey = await subtle().importKey(
          'jwk',
          existing.privateKeyJwk,
          ECDH_ALGO,
          true,
          ['deriveKey', 'deriveBits']
        );
        CryptoService.publicKeyBase64 = existing.publicKeyBase64;
        return { publicKeyBase64: existing.publicKeyBase64 };
      } catch {
        // Corrupt or unreadable record — fall through and mint a fresh pair.
      }
    }

    const keyPair = await subtle().generateKey(ECDH_ALGO, true, ['deriveKey', 'deriveBits']);
    CryptoService.localPrivateKey = keyPair.privateKey;

    const spki = await subtle().exportKey('spki', keyPair.publicKey);
    const pubBase64 = bytesToBase64(new Uint8Array(spki));
    CryptoService.publicKeyBase64 = pubBase64;

    const privateKeyJwk = await subtle().exportKey('jwk', keyPair.privateKey);
    await offlineStorage.saveIdentityKey(userId, {
      publicKeyBase64: pubBase64,
      privateKeyJwk,
      createdAt: new Date().toISOString(),
    });

    return { publicKeyBase64: pubBase64 };
  }

  /**
   * The current device's public key, or `''` if the identity key has not been
   * initialised. This deliberately returns nothing rather than a placeholder:
   * the previous implementation returned a hardcoded fake string, which made the
   * UI claim a trust anchor that did not exist.
   */
  static getPublicKey(): string {
    return CryptoService.publicKeyBase64 ?? '';
  }

  static hasIdentityKey(): boolean {
    return CryptoService.publicKeyBase64 !== null && CryptoService.localPrivateKey !== null;
  }

  /**
   * Derive the shared AES-256-GCM key for a conversation.
   *
   * ECDH → HKDF-SHA256 → AES-GCM. Both peers compute the identical key from
   * (my private key, their public key); the server only ever sees the public
   * halves, so it cannot reproduce it.
   */
  static async deriveSharedKey(peerPublicKeyBase64: string): Promise<CryptoKey> {
    const cached = CryptoService.sharedKeyCache.get(peerPublicKeyBase64);
    if (cached) return cached;

    if (!CryptoService.localPrivateKey) {
      throw new Error('E2EE identity key is not initialised');
    }
    if (!peerPublicKeyBase64) {
      throw new Error('Peer public key is required to derive a shared key');
    }

    let peerPublicKey: CryptoKey;
    try {
      peerPublicKey = await subtle().importKey(
        'spki',
        base64ToBytes(peerPublicKeyBase64),
        ECDH_ALGO,
        false,
        []
      );
    } catch {
      throw new Error('Peer public key is not a valid ECDH P-256 SPKI key');
    }

    const ecdhBits = await subtle().deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      CryptoService.localPrivateKey,
      256
    );

    const hkdfKey = await subtle().importKey('raw', ecdhBits, 'HKDF', false, ['deriveKey']);
    const aesKey = await subtle().deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: utf8(HKDF_SALT),
        info: utf8(HKDF_INFO),
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    CryptoService.sharedKeyCache.set(peerPublicKeyBase64, aesKey);
    return aesKey;
  }

  /** Encrypt a message body for a peer. Returns base64 ciphertext + 12-byte nonce. */
  static async encryptForPeer(
    plaintext: string,
    peerPublicKeyBase64: string
  ): Promise<{ ciphertext: string; nonce: string }> {
    const key = await CryptoService.deriveSharedKey(peerPublicKeyBase64);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await subtle().encrypt({ name: 'AES-GCM', iv }, key, utf8(plaintext));
    return {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      nonce: bytesToBase64(iv),
    };
  }

  /**
   * Decrypt a message body from a peer.
   * Throws on failure — callers should surface that rather than silently
   * substituting placeholder text, which is what the old implementation did.
   */
  static async decryptFromPeer(
    ciphertextBase64: string,
    nonceBase64: string,
    peerPublicKeyBase64: string
  ): Promise<string> {
    const key = await CryptoService.deriveSharedKey(peerPublicKeyBase64);
    const decrypted = await subtle().decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(nonceBase64) },
      key,
      base64ToBytes(ciphertextBase64)
    );
    return new TextDecoder().decode(decrypted);
  }

  /**
   * Seal a message body into a self-describing envelope for transport.
   *
   * AES-GCM needs its nonce alongside the ciphertext, but the schema only has
   * `messages.ciphertext_payload`, so the nonce travels inside the payload as
   * JSON. The version tag lets the format change later without ambiguity, and
   * keeps `content_text` free to stay NULL for sealed messages.
   */
  static async sealForPeer(plaintext: string, peerPublicKeyBase64: string): Promise<string> {
    const { ciphertext, nonce } = await CryptoService.encryptForPeer(plaintext, peerPublicKeyBase64);
    return JSON.stringify({ v: 1, n: nonce, c: ciphertext });
  }

  /**
   * True when a string looks like a direct envelope produced by {@link sealForPeer}.
   *
   * Group envelopes also carry `v: 1` plus a nonce and ciphertext, so the `g` tag
   * is excluded explicitly — otherwise a group message would be handed to the
   * direct-message path, which would try to open it under the wrong key.
   */
  static isEnvelope(payload: unknown): payload is string {
    if (typeof payload !== 'string' || !payload.startsWith('{')) return false;
    try {
      const parsed = JSON.parse(payload) as { v?: unknown; g?: unknown; n?: unknown; c?: unknown };
      return (
        parsed.v === 1 &&
        parsed.g !== 1 &&
        typeof parsed.n === 'string' &&
        typeof parsed.c === 'string'
      );
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Group (sender-key) ratchet
  // ---------------------------------------------------------------------------

  /**
   * One ratchet step: the message key for the current chain key, plus the chain
   * key that replaces it.
   *
   * Both are HMACs of the chain key under distinct one-byte constants, which is
   * the standard symmetric-key ratchet. It is one-way in the direction that
   * matters: the chain key is the HMAC *key*, so a recipient who holds message key
   * *n* cannot invert it to recover the chain key and read message *n+1*.
   */
  static async ratchetStep(chainKey: Uint8Array<ArrayBuffer>): Promise<{
    messageKey: Uint8Array<ArrayBuffer>;
    nextChainKey: Uint8Array<ArrayBuffer>;
  }> {
    const hmacKey = await subtle().importKey(
      'raw',
      chainKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const messageKey = await subtle().sign('HMAC', hmacKey, new Uint8Array([0x01]));
    const nextChainKey = await subtle().sign('HMAC', hmacKey, new Uint8Array([0x02]));
    return {
      messageKey: new Uint8Array(messageKey),
      nextChainKey: new Uint8Array(nextChainKey),
    };
  }

  /** AES-256-GCM under a raw 32-byte ratchet key. */
  static async encryptWithRawKey(
    plaintext: string,
    rawKey: Uint8Array<ArrayBuffer>
  ): Promise<{ ciphertext: string; nonce: string }> {
    const key = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await subtle().encrypt({ name: 'AES-GCM', iv }, key, utf8(plaintext));
    return {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      nonce: bytesToBase64(iv),
    };
  }

  /** Throws on failure so callers can distinguish a bad key from empty output. */
  static async decryptWithRawKey(
    ciphertextBase64: string,
    nonceBase64: string,
    rawKey: Uint8Array<ArrayBuffer>
  ): Promise<string> {
    const key = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await subtle().decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(nonceBase64) },
      key,
      base64ToBytes(ciphertextBase64)
    );
    return new TextDecoder().decode(decrypted);
  }

  static async sealGroupMessage(params: {
    plaintext: string;
    senderId: string;
    iteration: number;
    messageKey: Uint8Array<ArrayBuffer>;
  }): Promise<string> {
    const { ciphertext, nonce } = await CryptoService.encryptWithRawKey(
      params.plaintext,
      params.messageKey
    );
    const envelope: GroupEnvelope = {
      v: 1,
      g: 1,
      s: params.senderId,
      it: params.iteration,
      n: nonce,
      c: ciphertext,
    };
    return JSON.stringify(envelope);
  }

  /** Structural parse of a group envelope; `null` when it is anything else. */
  static parseGroupEnvelope(payload: unknown): GroupEnvelope | null {
    if (typeof payload !== 'string' || !payload.startsWith('{')) return null;
    try {
      const parsed = JSON.parse(payload) as Partial<GroupEnvelope>;
      if (parsed.v !== 1 || parsed.g !== 1) return null;
      if (typeof parsed.s !== 'string' || !parsed.s) return null;
      if (typeof parsed.it !== 'number' || !Number.isInteger(parsed.it) || parsed.it < 0)
        return null;
      if (typeof parsed.n !== 'string' || typeof parsed.c !== 'string') return null;
      return parsed as GroupEnvelope;
    } catch {
      return null;
    }
  }

  static isGroupEnvelope(payload: unknown): boolean {
    return CryptoService.parseGroupEnvelope(payload) !== null;
  }

  static async openGroupMessage(
    envelope: GroupEnvelope,
    messageKey: Uint8Array<ArrayBuffer>
  ): Promise<string> {
    return CryptoService.decryptWithRawKey(envelope.c, envelope.n, messageKey);
  }

  // ---------------------------------------------------------------------------
  // Sender-key distribution
  // ---------------------------------------------------------------------------

  /**
   * Seal a sender key to one recipient using the same ECDH construction as direct
   * messages, so the server stores an opaque blob it cannot open.
   */
  static async sealSenderKey(
    payload: SenderKeyPayload,
    recipientPublicKeyBase64: string
  ): Promise<string> {
    return CryptoService.sealForPeer(JSON.stringify(payload), recipientPublicKeyBase64);
  }

  /**
   * Open a sender-key blob. Returns `null` rather than throwing so one unusable
   * distribution cannot abort the rest of a batch.
   */
  static async openSenderKey(
    wrapped: string,
    senderPublicKeyBase64: string
  ): Promise<SenderKeyPayload | null> {
    try {
      const parsed = JSON.parse(
        await CryptoService.openFromPeer(wrapped, senderPublicKeyBase64)
      ) as Partial<SenderKeyPayload>;
      if (typeof parsed?.chainKeyHex !== 'string') return null;
      if (typeof parsed.iteration !== 'number') return null;
      if (typeof parsed.chatId !== 'string' || typeof parsed.senderId !== 'string') return null;
      return parsed as SenderKeyPayload;
    } catch {
      return null;
    }
  }

  /** Hex helpers for persisting chain keys in IndexedDB. */
  static bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  static hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
    if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
      throw new Error('Not a valid hex string');
    }
    const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  /** A fresh 32-byte chain key for a new sender key. */
  static randomChainKey(): Uint8Array<ArrayBuffer> {
    return globalThis.crypto.getRandomValues(new Uint8Array(32));
  }

  /**
   * Open an envelope from a peer.
   * Throws if it cannot be opened — callers must not silently substitute
   * placeholder text for a genuine decryption failure.
   */
  static async openFromPeer(envelope: string, peerPublicKeyBase64: string): Promise<string> {
    if (!CryptoService.isEnvelope(envelope)) {
      throw new Error('Payload is not a v1 E2EE envelope');
    }
    const { n, c } = JSON.parse(envelope) as { n: string; c: string };
    return CryptoService.decryptFromPeer(c, n, peerPublicKeyBase64);
  }

  /**
   * Safety number derived from two real public keys, so both parties see the
   * same value and it changes if either key does.
   *
   * This is a fingerprint for manual comparison, not a signature — it proves
   * nothing about possession, but a mismatch does reveal a substituted key.
   */
  static async computeSafetyNumber(myPubkey: string, peerPubkey: string): Promise<string> {
    const sorted = [myPubkey, peerPubkey].sort().join(':');
    const hashBuffer = await subtle().digest('SHA-256', utf8(sorted));
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    const numbers: string[] = [];
    for (let i = 0; i < 12; i++) {
      const b1 = hashArray[(i * 2) % hashArray.length];
      const b2 = hashArray[(i * 2 + 1) % hashArray.length];
      const num = ((b1 << 8) | b2) % 100000;
      numbers.push(num.toString().padStart(5, '0'));
    }

    return numbers.join(' ');
  }

  /** Clear in-memory key material (logout / account switch). */
  static reset(): void {
    CryptoService.localPrivateKey = null;
    CryptoService.publicKeyBase64 = null;
    CryptoService.sharedKeyCache.clear();
  }

  /**
   * @deprecated Superseded by {@link encryptForPeer}. This is the pre-E2EE
   * implementation: with no `secretKeyHex` it encrypts under a key hardcoded in
   * the JS bundle, so every client could read every message. It survives only
   * because the simulated mesh transport still calls it; it is not used by the
   * real send/receive path and should be deleted along with the mesh demo.
   */
  static async encrypt(plaintext: string, secretKeyHex?: string): Promise<{ ciphertext: string; nonce: string }> {
    const data = utf8(plaintext);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

    const rawKey = new Uint8Array(32);
    if (secretKeyHex) {
      for (let i = 0; i < 32; i++) rawKey[i] = secretKeyHex.charCodeAt(i % secretKeyHex.length);
    } else {
      rawKey.set([0x41, 0x65, 0x74, 0x68, 0x65, 0x72, 0x4d, 0x65, 0x73, 0x68, 0x54, 0x72, 0x75, 0x73, 0x74, 0x31]);
    }

    const key = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt']);
    const encrypted = await subtle().encrypt({ name: 'AES-GCM', iv }, key, data);

    return {
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      nonce: bytesToBase64(iv),
    };
  }

  /** @deprecated See {@link encrypt}. */
  static async decrypt(ciphertextBase64: string, nonceBase64: string, secretKeyHex?: string): Promise<string> {
    try {
      const rawKey = new Uint8Array(32);
      if (secretKeyHex) {
        for (let i = 0; i < 32; i++) rawKey[i] = secretKeyHex.charCodeAt(i % secretKeyHex.length);
      } else {
        rawKey.set([0x41, 0x65, 0x74, 0x68, 0x65, 0x72, 0x4d, 0x65, 0x73, 0x68, 0x54, 0x72, 0x75, 0x73, 0x74, 0x31]);
      }

      const key = await subtle().importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']);
      const decrypted = await subtle().decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(nonceBase64) },
        key,
        base64ToBytes(ciphertextBase64)
      );

      return new TextDecoder().decode(decrypted);
    } catch {
      return '[Encrypted Aerogram Mesh Payload]';
    }
  }
}
