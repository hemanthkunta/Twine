import * as SecureStore from 'expo-secure-store';
import type {
  Direction,
  KeyPairType,
  SessionRecordType,
  StorageType,
} from 'libsignal-protocol-typescript';
import { base64ToArrayBuffer, bytesToBase64 } from './crypto';

/**
 * Persistent key material for the mobile client.
 *
 * The Signal Protocol library is storage-agnostic: it asks for an identity key
 * pair, pre-keys, signed pre-keys, session records and trusted identities. The
 * browser client answers from IndexedDB; on mobile the same state lives in
 * `expo-secure-store`, so private keys are held by the platform keystore
 * rather than in the JavaScript heap.
 */

const NAMESPACE = 'e2ee';

type StoreKind =
  | 'identity'
  | 'p256identity'
  | 'prekey'
  | 'signedprekey'
  | 'signedprekeysignature'
  | 'session'
  | 'trust'
  | 'groupself'
  | 'grouppeer'
  | 'device';

export interface P256IdentityRecord {
  publicKeyBase64: string;
  privateKeyHex: string;
}

export interface TrustRecord {
  identityKeyBase64: string;
  verified?: boolean;
}

export interface GroupSelfState {
  chainKeyHex: string;
  iteration: number;
  distributedTo: string[];
  sentKeys: Record<string, string>;
}

export interface GroupPeerState {
  chainKeyHex: string;
  iteration: number;
  skipped: Record<string, string>;
}

export interface DeviceRecord {
  /** Identifier sent in the WebSocket handshake. */
  wsDeviceId: string;
  /** Numeric device id used for the E2EE pre-key bundle. */
  e2eeDeviceId: number;
}

function sanitize(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function storageKey(kind: StoreKind, id: string): string {
  return `${NAMESPACE}.${kind}.${sanitize(id)}`;
}

async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('SecureStore write failed for', key, e);
    return false;
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('SecureStore read failed for', key, e);
    return null;
  }
}

async function remove(key: string): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(key);
    return true;
  } catch (e) {
    console.warn('SecureStore delete failed for', key, e);
    return false;
  }
}

export class SignalStore {
  /* ---------- Signal Protocol identity ---------- */

  static async getIdentityKeyPair(
    userId: string,
    deviceId: number,
  ): Promise<KeyPairType | undefined> {
    const record = await readJson<{ pubKey: string; privKey: string }>(
      storageKey('identity', `${userId}:${deviceId}`),
    );
    if (!record) return undefined;
    return {
      pubKey: base64ToArrayBuffer(record.pubKey),
      privKey: base64ToArrayBuffer(record.privKey),
    };
  }

  static async putIdentityKeyPair(
    userId: string,
    deviceId: number,
    keyPair: KeyPairType,
  ): Promise<void> {
    await writeJson(storageKey('identity', `${userId}:${deviceId}`), {
      pubKey: bytesToBase64(new Uint8Array(keyPair.pubKey)),
      privKey: bytesToBase64(new Uint8Array(keyPair.privKey)),
    });
  }

  static async getLocalRegistrationId(
    userId: string,
    deviceId: number,
  ): Promise<number | undefined> {
    const record = await readJson<{ registrationId: number }>(
      storageKey('identity', `${userId}:${deviceId}`),
    );
    return record?.registrationId;
  }

  static async putLocalRegistrationId(
    userId: string,
    deviceId: number,
    registrationId: number,
  ): Promise<void> {
    const key = storageKey('identity', `${userId}:${deviceId}`);
    const record = (await readJson<{ pubKey: string; privKey: string; registrationId?: number }>(
      key,
    )) ?? { pubKey: '', privKey: '' };
    record.registrationId = registrationId;
    await writeJson(key, record);
  }

  /* ---------- Pre-keys ---------- */

  static async loadPreKey(
    userId: string,
    deviceId: number,
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    const record = await readJson<{ pubKey: string; privKey: string }>(
      storageKey('prekey', `${userId}:${deviceId}:${keyId}`),
    );
    if (!record) return undefined;
    return {
      pubKey: base64ToArrayBuffer(record.pubKey),
      privKey: base64ToArrayBuffer(record.privKey),
    };
  }

  static async storePreKey(
    userId: string,
    deviceId: number,
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    await writeJson(storageKey('prekey', `${userId}:${deviceId}:${keyId}`), {
      pubKey: bytesToBase64(new Uint8Array(keyPair.pubKey)),
      privKey: bytesToBase64(new Uint8Array(keyPair.privKey)),
    });
  }

  static async removePreKey(
    userId: string,
    deviceId: number,
    keyId: number | string,
  ): Promise<void> {
    await remove(storageKey('prekey', `${userId}:${deviceId}:${keyId}`));
  }

  /* ---------- Signed pre-keys ---------- */

  static async loadSignedPreKey(
    userId: string,
    deviceId: number,
    keyId: number | string,
  ): Promise<KeyPairType | undefined> {
    const record = await readJson<{ pubKey: string; privKey: string }>(
      storageKey('signedprekey', `${userId}:${deviceId}:${keyId}`),
    );
    if (!record) return undefined;
    return {
      pubKey: base64ToArrayBuffer(record.pubKey),
      privKey: base64ToArrayBuffer(record.privKey),
    };
  }

  static async storeSignedPreKey(
    userId: string,
    deviceId: number,
    keyId: number | string,
    keyPair: KeyPairType,
  ): Promise<void> {
    await writeJson(storageKey('signedprekey', `${userId}:${deviceId}:${keyId}`), {
      pubKey: bytesToBase64(new Uint8Array(keyPair.pubKey)),
      privKey: bytesToBase64(new Uint8Array(keyPair.privKey)),
    });
  }

  static async removeSignedPreKey(
    userId: string,
    deviceId: number,
    keyId: number | string,
  ): Promise<void> {
    await remove(storageKey('signedprekey', `${userId}:${deviceId}:${keyId}`));
  }

  static async loadSignedPreKeySignature(
    userId: string,
    deviceId: number,
    keyId: number | string,
  ): Promise<ArrayBuffer | undefined> {
    const record = await readJson<{ signature: string }>(
      storageKey('signedprekeysignature', `${userId}:${deviceId}:${keyId}`),
    );
    if (!record) return undefined;
    return base64ToArrayBuffer(record.signature);
  }

  static async storeSignedPreKeySignature(
    userId: string,
    deviceId: number,
    keyId: number | string,
    signature: ArrayBuffer,
  ): Promise<void> {
    await writeJson(storageKey('signedprekeysignature', `${userId}:${deviceId}:${keyId}`), {
      signature: bytesToBase64(new Uint8Array(signature)),
    });
  }

  /* ---------- Sessions ---------- */

  static async loadSession(
    userId: string,
    deviceId: number,
    encodedAddress: string,
  ): Promise<SessionRecordType | undefined> {
    const record = await readJson<{ record: string }>(
      storageKey('session', `${userId}:${deviceId}:${encodedAddress}`),
    );
    return record?.record;
  }

  static async storeSession(
    userId: string,
    deviceId: number,
    encodedAddress: string,
    record: SessionRecordType,
  ): Promise<void> {
    await writeJson(storageKey('session', `${userId}:${deviceId}:${encodedAddress}`), {
      record,
    });
  }

  static async removeSession(
    userId: string,
    deviceId: number,
    encodedAddress: string,
  ): Promise<void> {
    await remove(storageKey('session', `${userId}:${deviceId}:${encodedAddress}`));
  }

  /* ---------- Trust ---------- */

  static async isTrustedIdentity(
    userId: string,
    deviceId: number,
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction | number,
  ): Promise<boolean> {
    const key = storageKey('trust', `${userId}:${deviceId}:${identifier}`);
    const record = await readJson<TrustRecord>(key);
    const incoming = bytesToBase64(new Uint8Array(identityKey));
    if (!record) {
      await writeJson(key, { identityKeyBase64: incoming });
      return true;
    }
    if (record.identityKeyBase64 !== incoming) {
      console.warn('Identity key mismatch for', identifier, '- refusing to trust');
      return false;
    }
    return true;
  }

  static async saveIdentity(
    userId: string,
    deviceId: number,
    encodedAddress: string,
    publicKey: ArrayBuffer,
  ): Promise<boolean> {
    const key = storageKey('trust', `${userId}:${deviceId}:${encodedAddress}`);
    const incoming = bytesToBase64(new Uint8Array(publicKey));
    const record = await readJson<TrustRecord>(key);
    if (!record) {
      await writeJson(key, { identityKeyBase64: incoming });
      return true;
    }
    if (record.identityKeyBase64 !== incoming) {
      console.warn('Identity key mismatch for', encodedAddress, '- rejecting key change');
      return false;
    }
    return true;
  }

  static async isPeerVerified(
    userId: string,
    deviceId: number,
    peerUserId: string,
    peerDeviceId: number,
  ): Promise<boolean> {
    const record = await readJson<TrustRecord>(
      storageKey('trust', `${userId}:${deviceId}:${peerUserId}:${peerDeviceId}`),
    );
    return record?.verified === true;
  }

  /* ---------- P-256 identity (group sender keys) ---------- */

  static async getP256Identity(userId: string): Promise<P256IdentityRecord | null> {
    return readJson<P256IdentityRecord>(storageKey('p256identity', userId));
  }

  static async putP256Identity(userId: string, record: P256IdentityRecord): Promise<void> {
    await writeJson(storageKey('p256identity', userId), record);
  }

  /* ---------- Group sender-key state ---------- */

  static async getGroupSelfState(chatId: string): Promise<GroupSelfState | null> {
    return readJson<GroupSelfState>(storageKey('groupself', chatId));
  }

  static async putGroupSelfState(chatId: string, state: GroupSelfState): Promise<void> {
    await writeJson(storageKey('groupself', chatId), state);
  }

  static async getGroupPeerState(
    chatId: string,
    senderId: string,
  ): Promise<GroupPeerState | null> {
    return readJson<GroupPeerState>(storageKey('grouppeer', `${chatId}:${senderId}`));
  }

  static async putGroupPeerState(
    chatId: string,
    senderId: string,
    state: GroupPeerState,
  ): Promise<void> {
    await writeJson(storageKey('grouppeer', `${chatId}:${senderId}`), state);
  }

  /* ---------- Device identity ---------- */

  static async getDeviceRecord(userId: string): Promise<DeviceRecord | null> {
    return readJson<DeviceRecord>(storageKey('device', userId));
  }

  static async putDeviceRecord(userId: string, record: DeviceRecord): Promise<void> {
    await writeJson(storageKey('device', userId), record);
  }
}

/**
 * The storage adapter handed to the Signal Protocol library.
 */
export class SignalProtocolStore implements StorageType {
  constructor(
    private readonly userId: string,
    private readonly deviceId: number,
  ) {}

  getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    return SignalStore.getIdentityKeyPair(this.userId, this.deviceId);
  }

  putIdentityKeyPair(keyPair: KeyPairType): Promise<void> {
    return SignalStore.putIdentityKeyPair(this.userId, this.deviceId, keyPair);
  }

  getLocalRegistrationId(): Promise<number | undefined> {
    return SignalStore.getLocalRegistrationId(this.userId, this.deviceId);
  }

  putLocalRegistrationId(registrationId: number): Promise<void> {
    return SignalStore.putLocalRegistrationId(this.userId, this.deviceId, registrationId);
  }

  isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    direction: Direction | number,
  ): Promise<boolean> {
    return SignalStore.isTrustedIdentity(
      this.userId,
      this.deviceId,
      identifier,
      identityKey,
      direction,
    );
  }

  saveIdentity(encodedAddress: string, publicKey: ArrayBuffer): Promise<boolean> {
    return SignalStore.saveIdentity(this.userId, this.deviceId, encodedAddress, publicKey);
  }

  loadPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    return SignalStore.loadPreKey(this.userId, this.deviceId, keyId);
  }

  storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    return SignalStore.storePreKey(this.userId, this.deviceId, keyId, keyPair);
  }

  removePreKey(keyId: number | string): Promise<void> {
    return SignalStore.removePreKey(this.userId, this.deviceId, keyId);
  }

  loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    return SignalStore.loadSignedPreKey(this.userId, this.deviceId, keyId);
  }

  storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    return SignalStore.storeSignedPreKey(this.userId, this.deviceId, keyId, keyPair);
  }

  removeSignedPreKey(keyId: number | string): Promise<void> {
    return SignalStore.removeSignedPreKey(this.userId, this.deviceId, keyId);
  }

  storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    return SignalStore.storeSession(this.userId, this.deviceId, encodedAddress, record);
  }

  loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    return SignalStore.loadSession(this.userId, this.deviceId, encodedAddress);
  }

  removeSession(encodedAddress: string): Promise<void> {
    return SignalStore.removeSession(this.userId, this.deviceId, encodedAddress);
  }
}

export default SignalStore;
