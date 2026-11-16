import api from './api';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  deriveSharedKey,
  generateP256KeyPair,
  hexToBytes,
  p256PointFromSpki,
  p256SpkiFromPoint,
} from './crypto';
import { SignalStore } from './signalStore';

/**
 * The P-256 identity key that seals group sender keys.
 *
 * This is a separate key from the Signal Protocol identity: the Signal
 * identity signs pre-key bundles (Ed25519, handled by libsignal), while this
 * one performs the ECDH that seals a sender-key copy to a single recipient.
 * The browser client publishes the same key at `POST /keys/publish`, so both
 * clients can open each other's sender-key distributions.
 */
export class IdentityService {
  private static privateKey: Uint8Array | null = null;
  private static publicKeyBase64: string | null = null;

  /** Load the stored identity key, creating one on first use. */
  static async ensureIdentityKey(userId: string): Promise<string> {
    const record = await SignalStore.getP256Identity(userId);
    if (record?.publicKeyBase64 && record.privateKeyHex) {
      IdentityService.privateKey = hexToBytes(record.privateKeyHex);
      IdentityService.publicKeyBase64 = record.publicKeyBase64;
      return record.publicKeyBase64;
    }

    const pair = generateP256KeyPair();
    const publicKeyBase64 = bytesToBase64(p256SpkiFromPoint(pair.publicPoint));
    await SignalStore.putP256Identity(userId, {
      publicKeyBase64,
      privateKeyHex: bytesToHex(pair.privateKey),
    });
    IdentityService.privateKey = pair.privateKey;
    IdentityService.publicKeyBase64 = publicKeyBase64;
    return publicKeyBase64;
  }

  static getPublicKey(): string | null {
    return IdentityService.publicKeyBase64;
  }

  /** The shared AES-256-GCM key for this device and one peer. */
  static async deriveSharedKey(peerPublicKeyBase64: string): Promise<Uint8Array> {
    if (!IdentityService.privateKey) {
      throw new Error('E2EE identity key is not initialised');
    }
    if (!peerPublicKeyBase64) {
      throw new Error('Peer public key is required to derive a shared key');
    }
    const point = p256PointFromSpki(base64ToBytes(peerPublicKeyBase64));
    return deriveSharedKey(IdentityService.privateKey, point);
  }

  /** The identity key a user published, or `null` when they published none. */
  static async identityKeyOf(userId: string): Promise<string | null> {
    try {
      const response = await api.getPublicKey(userId);
      return response?.public_key || null;
    } catch {
      return null;
    }
  }

  static reset(): void {
    IdentityService.privateKey = null;
    IdentityService.publicKeyBase64 = null;
  }
}

export default IdentityService;
