import './cryptoPolyfill';
import { cbc, gcm } from '@noble/ciphers/aes';
import { p256 } from '@noble/curves/p256';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { randomBytes } from './cryptoPolyfill';

/**
 * Cryptographic primitives for React Native.
 *
 * Hermes has no WebCrypto, so the primitives the browser client relies on are
 * provided here by `@noble/*` (pure JavaScript, already part of the mobile
 * dependency tree). Every construction below is byte-compatible with the
 * WebCrypto one it replaces, so a mobile client and a web client can talk to
 * each other:
 *
 *  - ECDH P-256 + HKDF-SHA256 + AES-256-GCM for group sender keys,
 *  - HMAC-SHA256 chain-key ratchet for group messages,
 *  - AES-CBC / HMAC-SHA256 / SHA-512 for the Signal Protocol library.
 */

// ── Encoding helpers ─────────────────────────────────────────────────

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 63];
  }
  return out;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const index = BASE64_ALPHABET.indexOf(clean[i]);
    if (index < 0) continue;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, written);
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error('Not a valid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i++];
    let code: number;
    if (byte < 0x80) {
      code = byte;
    } else if (byte >= 0xc0 && byte < 0xe0) {
      code = ((byte & 0x1f) << 6) | (bytes[i++] & 0x3f);
    } else if (byte >= 0xe0 && byte < 0xf0) {
      code = ((byte & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    } else {
      code =
        ((byte & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    }
    if (code > 0xffff) {
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

/** Base64 → a standalone `ArrayBuffer` (never a view onto a shared buffer). */
export function base64ToArrayBuffer(value: string): ArrayBuffer {
  return toArrayBuffer(base64ToBytes(value));
}

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data);
}

// ── WebCrypto shim for libsignal ─────────────────────────────────────

interface SubtleKey {
  name: string;
  key: Uint8Array;
}

const subtleShim = {
  async importKey(
    _format: string,
    keyData: ArrayBuffer | Uint8Array,
    algorithm: unknown,
  ): Promise<SubtleKey> {
    const name = typeof algorithm === 'string' ? algorithm : (algorithm as any)?.name;
    if (name !== 'AES-CBC' && name !== 'HMAC') {
      throw new Error(`Unsupported key algorithm: ${String(name)}`);
    }
    return { name, key: toBytes(keyData) };
  },

  async encrypt(
    algorithm: any,
    key: SubtleKey,
    data: ArrayBuffer | Uint8Array,
  ): Promise<ArrayBuffer> {
    if (key.name !== 'AES-CBC') throw new Error(`Unsupported key for encrypt: ${key.name}`);
    const iv = toBytes(algorithm.iv);
    return toArrayBuffer(cbc(key.key, iv).encrypt(toBytes(data)));
  },

  async decrypt(
    algorithm: any,
    key: SubtleKey,
    data: ArrayBuffer | Uint8Array,
  ): Promise<ArrayBuffer> {
    if (key.name !== 'AES-CBC') throw new Error(`Unsupported key for decrypt: ${key.name}`);
    const iv = toBytes(algorithm.iv);
    return toArrayBuffer(cbc(key.key, iv).decrypt(toBytes(data)));
  },

  async sign(
    _algorithm: unknown,
    key: SubtleKey,
    data: ArrayBuffer | Uint8Array,
  ): Promise<ArrayBuffer> {
    if (key.name !== 'HMAC') throw new Error(`Unsupported key for sign: ${key.name}`);
    return toArrayBuffer(hmac(sha256, key.key, toBytes(data)));
  },

  async digest(
    algorithm: any,
    data: ArrayBuffer | Uint8Array,
  ): Promise<ArrayBuffer> {
    const name = algorithm?.name;
    if (name === 'SHA-512') return toArrayBuffer(sha512(toBytes(data)));
    if (name === 'SHA-256') return toArrayBuffer(sha256(toBytes(data)));
    throw new Error(`Unsupported digest: ${String(name)}`);
  },
};

export const webCryptoShim = {
  getRandomValues: (array: Uint8Array): Uint8Array => {
    const target = array instanceof Uint8Array ? array : new Uint8Array(array as any);
    const source = randomBytes(target.length);
    target.set(source);
    return target;
  },
  subtle: subtleShim,
};

let libsignalModule: any = null;

/**
 * Load the Signal Protocol library lazily.
 *
 * The library pulls in a WebAssembly-to-JavaScript build of curve25519 and
 * evaluates it while its module body runs, so it is only loaded once the app
 * actually needs encryption. A failure here is reported to the user instead of
 * taking the whole app down at start-up.
 */
export async function loadLibsignal(): Promise<any> {
  if (!libsignalModule) {
    const mod: any = await import('libsignal-protocol-typescript');
    mod.setWebCrypto(webCryptoShim);
    libsignalModule = mod;
  }
  return libsignalModule;
}

// ── P-256 (ECDH) ──────────────────────────────────────────────────────

const P256_SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
  0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00,
]);

const HKDF_SALT = utf8Encode('twine-e2ee-v1');
const HKDF_INFO = utf8Encode('twine-e2ee-p256-chat-key');

export interface P256KeyPair {
  privateKey: Uint8Array;
  /** Uncompressed point: 0x04 || X || Y. */
  publicPoint: Uint8Array;
}

export function generateP256KeyPair(): P256KeyPair {
  for (let attempt = 0; attempt < 8; attempt++) {
    const privateKey = randomBytes(32);
    try {
      const publicPoint = p256.getPublicKey(privateKey, false);
      return { privateKey, publicPoint };
    } catch {
      // Not a valid scalar — draw again.
    }
  }
  throw new Error('Could not generate a P-256 key pair');
}

export function p256SpkiFromPoint(point: Uint8Array): Uint8Array {
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error('Unexpected P-256 public point');
  }
  const out = new Uint8Array(P256_SPKI_PREFIX.length + point.length);
  out.set(P256_SPKI_PREFIX, 0);
  out.set(point, P256_SPKI_PREFIX.length);
  return out;
}

export function p256PointFromSpki(spki: Uint8Array): Uint8Array {
  if (spki.length !== P256_SPKI_PREFIX.length + 65) {
    throw new Error('Unexpected P-256 SPKI length');
  }
  for (let i = 0; i < P256_SPKI_PREFIX.length; i++) {
    if (spki[i] !== P256_SPKI_PREFIX[i]) throw new Error('Unexpected P-256 SPKI structure');
  }
  const point = spki.slice(P256_SPKI_PREFIX.length);
  if (point[0] !== 0x04) throw new Error('Unexpected P-256 SPKI point');
  return point;
}

/**
 * ECDH shared secret, matching WebCrypto's `deriveBits`: the x-coordinate of
 * the shared point, big-endian and zero-padded to the field size.
 */
export function p256SharedSecret(privateKey: Uint8Array, peerPoint: Uint8Array): Uint8Array {
  const shared = p256.getSharedSecret(privateKey, peerPoint, false);
  return shared.slice(1, 33);
}

/** ECDH → HKDF-SHA256 → a 32-byte AES-256-GCM key. */
export function deriveSharedKey(privateKey: Uint8Array, peerPoint: Uint8Array): Uint8Array {
  const secret = p256SharedSecret(privateKey, peerPoint);
  return hkdf(sha256, secret, HKDF_SALT, HKDF_INFO, 32);
}

// ── Symmetric primitives ──────────────────────────────────────────────

export function encryptAesGcm(
  key: Uint8Array,
  plaintext: string,
): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(12);
  const sealed = gcm(key, nonce).encrypt(utf8Encode(plaintext));
  return { ciphertext: bytesToBase64(sealed), nonce: bytesToBase64(nonce) };
}

export function decryptAesGcm(
  key: Uint8Array,
  ciphertextBase64: string,
  nonceBase64: string,
): string {
  const sealed = base64ToBytes(ciphertextBase64);
  const plain = gcm(key, base64ToBytes(nonceBase64)).decrypt(sealed);
  return utf8Decode(plain);
}

export function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha256, key, data);
}

/**
 * One sender-key ratchet step: the message key for the current chain key and
 * the chain key that replaces it.
 */
export function ratchetStep(chainKey: Uint8Array): {
  messageKey: Uint8Array;
  nextChainKey: Uint8Array;
} {
  return {
    messageKey: hmacSha256(chainKey, new Uint8Array([0x01])),
    nextChainKey: hmacSha256(chainKey, new Uint8Array([0x02])),
  };
}

// ── Envelopes ─────────────────────────────────────────────────────────

export interface PeerEnvelope {
  v: 1;
  n: string;
  c: string;
}

export interface GroupEnvelope {
  v: 1;
  g: 1;
  s: string;
  it: number;
  n: string;
  c: string;
}

export interface SenderKeyPayload {
  chatId: string;
  senderId: string;
  chainKeyHex: string;
  iteration: number;
}

/** Seal a body to a peer: AES-GCM under the shared key, nonce carried inside. */
export function sealForPeer(plaintext: string, sharedKey: Uint8Array): string {
  const { ciphertext, nonce } = encryptAesGcm(sharedKey, plaintext);
  const envelope: PeerEnvelope = { v: 1, n: nonce, c: ciphertext };
  return JSON.stringify(envelope);
}

export function parsePeerEnvelope(payload: unknown): PeerEnvelope | null {
  if (typeof payload !== 'string' || !payload.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<PeerEnvelope> & { g?: unknown };
    if (parsed.v !== 1 || parsed.g === 1) return null;
    if (typeof parsed.n !== 'string' || typeof parsed.c !== 'string') return null;
    return parsed as PeerEnvelope;
  } catch {
    return null;
  }
}

export function openFromPeer(payload: string, sharedKey: Uint8Array): string {
  const envelope = parsePeerEnvelope(payload);
  if (!envelope) throw new Error('Payload is not a v1 E2EE envelope');
  return decryptAesGcm(sharedKey, envelope.c, envelope.n);
}

export function sealGroupMessage(params: {
  plaintext: string;
  senderId: string;
  iteration: number;
  messageKey: Uint8Array;
}): string {
  const { ciphertext, nonce } = encryptAesGcm(params.messageKey, params.plaintext);
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

export function parseGroupEnvelope(payload: unknown): GroupEnvelope | null {
  if (typeof payload !== 'string' || !payload.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(payload) as Partial<GroupEnvelope>;
    if (parsed.v !== 1 || parsed.g !== 1) return null;
    if (typeof parsed.s !== 'string' || !parsed.s) return null;
    if (typeof parsed.it !== 'number' || !Number.isInteger(parsed.it) || parsed.it < 0) return null;
    if (typeof parsed.n !== 'string' || typeof parsed.c !== 'string') return null;
    return parsed as GroupEnvelope;
  } catch {
    return null;
  }
}

export function openGroupMessage(envelope: GroupEnvelope, messageKey: Uint8Array): string {
  return decryptAesGcm(messageKey, envelope.c, envelope.n);
}

export function sealSenderKey(
  payload: SenderKeyPayload,
  sharedKey: Uint8Array,
): string {
  return sealForPeer(JSON.stringify(payload), sharedKey);
}

export function openSenderKey(
  wrapped: string,
  sharedKey: Uint8Array,
): SenderKeyPayload | null {
  try {
    const parsed = JSON.parse(openFromPeer(wrapped, sharedKey)) as Partial<SenderKeyPayload>;
    if (typeof parsed?.chainKeyHex !== 'string') return null;
    if (typeof parsed.iteration !== 'number') return null;
    if (typeof parsed.chatId !== 'string' || typeof parsed.senderId !== 'string') return null;
    return parsed as SenderKeyPayload;
  } catch {
    return null;
  }
}
