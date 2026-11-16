import api from './api';
import { base64ToArrayBuffer, base64ToBytes, bytesToBase64, loadLibsignal, utf8Decode, utf8Encode } from './crypto';
import { randomBytes } from './cryptoPolyfill';
import { SignalProtocolStore, SignalStore } from './signalStore';

/**
 * Signal Protocol operations for the mobile client.
 *
 * This mirrors the browser client's `client/src/services/signalClient.ts`: the
 * same library, the same pre-key bundle format and the same envelope encoding,
 * so a mobile device and a browser device can open a session with each other.
 */

export interface PreKeyBundlePayload {
  registrationId: number;
  deviceId: number;
  preKeyId: number;
  preKeyPublic: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  identityKey: string;
  oneTimePreKeys: Array<{ id: number; publicKey: string }>;
}

export interface PeerDevice {
  deviceId: number;
  deviceName: string | null;
  publicKey: string;
  isRevoked: boolean;
}

const DEVICE_NAME = 'Mobile';

export class SignalClientService {
  private static stores = new Map<string, SignalProtocolStore>();

  static getStore(userId: string, deviceId: number): SignalProtocolStore {
    const key = `${userId}:${deviceId}`;
    let store = this.stores.get(key);
    if (!store) {
      store = new SignalProtocolStore(userId, deviceId);
      this.stores.set(key, store);
    }
    return store;
  }

  static reset(): void {
    this.stores.clear();
  }

  /**
   * Mint this device's pre-key bundle.
   *
   * The identity key and the signed pre-key are reused when they already exist,
   * so the bundle stays stable across restarts; only the one-time pre-keys are
   * refreshed.
   */
  static async generatePreKeyBundle(
    userId: string,
    deviceId: number,
  ): Promise<PreKeyBundlePayload> {
    const libsignal = await loadLibsignal();
    const store = SignalClientService.getStore(userId, deviceId);

    const registrationId =
      (await store.getLocalRegistrationId()) || libsignal.KeyHelper.generateRegistrationId() || 1;

    const identityKeyPair =
      (await store.getIdentityKeyPair()) || (await libsignal.KeyHelper.generateIdentityKeyPair());
    await store.putIdentityKeyPair(identityKeyPair);
    await store.putLocalRegistrationId(registrationId);

    const preKeyId = SignalClientService.randomKeyId();
    const preKeyPair = await libsignal.KeyHelper.generatePreKey(preKeyId);
    await store.storePreKey(preKeyPair.keyId, preKeyPair.keyPair);

    const existingSigned = await store.loadSignedPreKey(1);
    const existingSignature = await SignalClientService.getSignedPreKeySignature(
      userId,
      deviceId,
      1,
    );
    const signedPreKeyPair =
      existingSigned && existingSignature
        ? { keyId: 1, keyPair: existingSigned, signature: existingSignature }
        : await libsignal.KeyHelper.generateSignedPreKey(identityKeyPair, 1);
    await store.storeSignedPreKey(signedPreKeyPair.keyId, signedPreKeyPair.keyPair);
    await SignalClientService.storeSignedPreKeySignature(
      userId,
      deviceId,
      signedPreKeyPair.keyId,
      signedPreKeyPair.signature,
    );

    const oneTimePreKeys: Array<{ id: number; publicKey: string }> = [];
    for (let i = 0; i < 10; i++) {
      const oneTime = await libsignal.KeyHelper.generatePreKey(preKeyId + i + 1);
      await store.storePreKey(oneTime.keyId, oneTime.keyPair);
      oneTimePreKeys.push({
        id: oneTime.keyId,
        publicKey: bytesToBase64(new Uint8Array(oneTime.keyPair.pubKey)),
      });
    }

    return {
      registrationId,
      deviceId,
      preKeyId: preKeyPair.keyId,
      preKeyPublic: bytesToBase64(new Uint8Array(preKeyPair.keyPair.pubKey)),
      signedPreKeyId: signedPreKeyPair.keyId,
      signedPreKeyPublic: bytesToBase64(
        new Uint8Array(signedPreKeyPair.keyPair.pubKey),
      ),
      signedPreKeySignature: bytesToBase64(new Uint8Array(signedPreKeyPair.signature)),
      identityKey: bytesToBase64(new Uint8Array(identityKeyPair.pubKey)),
      oneTimePreKeys,
    };
  }

  /** Publish this device's bundle so peers can start a session with it. */
  static async publishPreKeyBundle(userId: string, deviceId: number): Promise<boolean> {
    const bundle = await SignalClientService.generatePreKeyBundle(userId, deviceId);

    const devices = await api.listDevices();
    const registered = (devices?.devices ?? []).some(
      (device: { deviceId: number }) => device.deviceId === deviceId,
    );
    if (!registered) {
      const ok = await api.registerDevice(deviceId, DEVICE_NAME, bundle.identityKey);
      if (!ok) return false;
    }

    return api.publishPreKeyBundle(bundle);
  }

  /**
   * Make sure a session exists for the peer device.
   *
   * Returns `true` when a session was created, `false` when one already existed.
   */
  static async ensureSession(
    userId: string,
    deviceId: number,
    remoteUserId: string,
    remoteDeviceId: number,
  ): Promise<boolean> {
    const libsignal = await loadLibsignal();
    const store = SignalClientService.getStore(userId, deviceId);
    const remoteAddress = new libsignal.SignalProtocolAddress(remoteUserId, remoteDeviceId);

    const existing = await store.loadSession(remoteAddress.toString());
    if (existing) return false;

    await SignalClientService.publishPreKeyBundle(userId, deviceId);

    const response = await api.getPreKeyBundle(remoteUserId, remoteDeviceId);
    const bundle = response?.bundle;
    if (!bundle?.identityKey) {
      throw new Error(`No pre-key bundle available for ${remoteUserId}`);
    }

    const sessionBuilder = new libsignal.SessionBuilder(store, remoteAddress);
    await sessionBuilder.processPreKey({
      identityKey: base64ToArrayBuffer(bundle.identityKey),
      signedPreKey: {
        keyId: bundle.signedPreKeyId,
        publicKey: base64ToArrayBuffer(bundle.signedPreKeyPublic),
        signature: base64ToArrayBuffer(bundle.signedPreKeySignature),
      },
      preKey: {
        keyId: bundle.preKeyId,
        publicKey: base64ToArrayBuffer(bundle.preKeyPublic),
      },
      registrationId: bundle.registrationId,
    });

    return true;
  }

  /** Encrypt one message for one peer device. */
  static async encrypt(
    userId: string,
    deviceId: number,
    remoteAddress: any,
    plaintext: string,
  ): Promise<string> {
    const libsignal = await loadLibsignal();
    const store = SignalClientService.getStore(userId, deviceId);
    const cipher = new libsignal.SessionCipher(store, remoteAddress);
    const ciphertext = await cipher.encrypt(utf8Encode(plaintext).buffer as ArrayBuffer);
    const bodyArray =
      typeof ciphertext.body === 'string'
        ? Array.from(ciphertext.body as string, (c: string) => c.charCodeAt(0))
        : Array.from(new Uint8Array(ciphertext.body as ArrayBuffer));
    const payload = JSON.stringify({
      type: ciphertext.type,
      body: bodyArray,
      registrationId: ciphertext.registrationId ?? 0,
    });
    return bytesToBase64(utf8Encode(payload));
  }

  /** Decrypt one message from one peer device. */
  static async decrypt(
    userId: string,
    deviceId: number,
    remoteAddress: any,
    ciphertextBase64: string,
  ): Promise<string> {
    const libsignal = await loadLibsignal();
    const store = SignalClientService.getStore(userId, deviceId);
    const cipher = new libsignal.SessionCipher(store, remoteAddress);
    const parsed = JSON.parse(utf8Decode(base64ToBytes(ciphertextBase64)));
    const bodyBytes = new Uint8Array(parsed.body).buffer;
    const plaintext =
      parsed.type === 3
        ? await cipher.decryptPreKeyWhisperMessage(bodyBytes)
        : await cipher.decryptWhisperMessage(bodyBytes);
    return utf8Decode(new Uint8Array(plaintext));
  }

  /** The peer's published identity key for one of their devices. */
  static async getRemoteIdentityKey(
    peerUserId: string,
    peerDeviceId: number,
  ): Promise<ArrayBuffer | null> {
    try {
      const response = await api.getPreKeyBundle(peerUserId, peerDeviceId);
      const identityKey = response?.bundle?.identityKey;
      if (!identityKey) return null;
      return base64ToArrayBuffer(identityKey);
    } catch {
      return null;
    }
  }

  /** Every non-revoked device a user has registered. */
  static async listDevices(userId: string): Promise<PeerDevice[]> {
    try {
      const response = await api.listPeerDevices(userId);
      return (response?.devices ?? []).filter((device: PeerDevice) => !device.isRevoked);
    } catch {
      return [];
    }
  }

  private static randomKeyId(): number {
    const bytes = randomBytes(4);
    const value =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    return (value % 0xffff00) + 1;
  }

  private static async getSignedPreKeySignature(
    userId: string,
    deviceId: number,
    keyId: number,
  ): Promise<ArrayBuffer | undefined> {
    return SignalStore.loadSignedPreKeySignature(userId, deviceId, keyId);
  }

  private static async storeSignedPreKeySignature(
    userId: string,
    deviceId: number,
    keyId: number,
    signature: ArrayBuffer,
  ): Promise<void> {
    await SignalStore.storeSignedPreKeySignature(userId, deviceId, keyId, signature);
  }
}

export default SignalClientService;
