import {
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  KeyHelper,
  KeyPairType,
  SessionRecordType,
  PreKeyPairType,
  SignedPreKeyPairType,
  DeviceType,
} from 'libsignal-protocol-typescript';
import { SessionRecord } from 'libsignal-protocol-typescript/lib/session-record.js';
import { SessionLock } from 'libsignal-protocol-typescript/lib/session-lock.js';
import { offlineStorage } from './storage';
import { SignalProtocolStore } from './signalStore';
import { ApiService } from './api';
import { MessageType } from '../types/index';

export class SignalClientService {
  private static stores = new Map<string, SignalProtocolStore>();

  private static getStore(userId: string, deviceId: number): SignalProtocolStore {
    const key = `${userId}:${deviceId}`;
    let store = this.stores.get(key);
    if (!store) {
      store = new SignalProtocolStore(userId, deviceId);
      this.stores.set(key, store);
    }
    return store;
  }

  /** Drop cached lookups (logout / account switch). */
  static reset(): void {
    this.stores.clear();
  }

  // Generate a unique device ID
  static async generateDeviceId(): Promise<number> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('devices', 'readonly');
      const store = txn.objectStore('devices');
      const req = store.getAll();
      req.onsuccess = () => {
        const devices = req.result || [];
        const maxId = devices.reduce((max, d) => Math.max(max, d.deviceId || 0), 0);
        resolve(maxId + 1);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Generate identity key pair for this device
  static async generateIdentityKey(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey }> {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey };
  }

  // Store identity key in IndexedDB (identity_keys store already exists)
  static async storeIdentityKey(userId: string, deviceId: number, keyPair: { privateKey: ArrayBuffer; publicKey: ArrayBuffer }): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('identity_keys', 'readwrite');
      const store = txn.objectStore('identity_keys');
      store.put({ id: `${userId}:${deviceId}`, userId, deviceId, publicKey: keyPair.publicKey, privateKey: keyPair.privateKey });
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  // Load identity key
  static async loadIdentityKey(userId: string, deviceId: number): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey } | null> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('identity_keys', 'readonly');
      const store = txn.objectStore('identity_keys');
      const req = store.get(`${userId}:${deviceId}`);
      req.onsuccess = async () => {
        const record = req.result;
        if (!record) return resolve(null);
        const privateKey = await crypto.subtle.importKey('pkcs8', record.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']);
        const publicKey = await crypto.subtle.importKey('spki', record.publicKey, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
        resolve({ privateKey, publicKey });
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Generate pre-key bundle for X3DH
  static async generatePreKeyBundle(userId: string, deviceId: number, options: { preKeyCount?: number } = {}): Promise<{
    registrationId: number;
    deviceId: number;
    preKeyId: number;
    preKeyPublic: string;
    signedPreKeyId: number;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    identityKey: string;
    oneTimePreKeys: Array<{ id: number; publicKey: string }>;
  }> {
    const store = this.getStore(userId, deviceId);
    const registrationId = (await store.getLocalRegistrationId()) || (KeyHelper.generateRegistrationId() || 1);

    const identityKeyPair = await store.getIdentityKeyPair() ?? await KeyHelper.generateIdentityKeyPair();
    await store.putIdentityKeyPair(identityKeyPair);
    await store.putLocalRegistrationId(registrationId);

    const preKeyId = crypto.getRandomValues(new Uint32Array(1))[0] % 0xffff00;
    const preKeyPair: PreKeyPairType = await KeyHelper.generatePreKey(preKeyId);
    await store.storePreKey(preKeyPair.keyId, preKeyPair.keyPair);

    const existingSigned = await store.loadSignedPreKey(1);
    const signature = await store.loadSignedPreKeySignature(1);
    const signedPreKeyPair: SignedPreKeyPairType = existingSigned && signature
      ? { keyId: 1, keyPair: existingSigned, signature }
      : await KeyHelper.generateSignedPreKey(identityKeyPair, 1);
    await store.storeSignedPreKey(signedPreKeyPair.keyId, signedPreKeyPair.keyPair);
    await store.storeSignedPreKeySignature(signedPreKeyPair.keyId, signedPreKeyPair.signature);

    const toB64 = (ab: ArrayBuffer) => btoa(String.fromCharCode(...Array.from(new Uint8Array(ab))));

    // Generate 100+ one-time pre-keys for better availability
    const preKeyCount = options.preKeyCount ?? 100;
    const oneTimePreKeys = [];
    for (let i = 0; i < preKeyCount; i++) {
      const otpk: PreKeyPairType = await KeyHelper.generatePreKey(preKeyId + i + 1);
      await store.storePreKey(otpk.keyId, otpk.keyPair);
      oneTimePreKeys.push({
        id: otpk.keyId,
        publicKey: toB64(otpk.keyPair.pubKey)
      });
    }

    const result = {
      registrationId,
      deviceId,
      preKeyId: preKeyPair.keyId,
      preKeyPublic: toB64(preKeyPair.keyPair.pubKey),
      signedPreKeyId: signedPreKeyPair.keyId,
      signedPreKeyPublic: toB64(signedPreKeyPair.keyPair.pubKey),
      signedPreKeySignature: toB64(signedPreKeyPair.signature),
      identityKey: toB64(identityKeyPair.pubKey),
      oneTimePreKeys: oneTimePreKeys.map(function(otpk) {
        return { id: otpk.id, publicKey: otpk.publicKey };
      }),
    };
    return result;
  }

  /**
   * Build a pre-key bundle from EXISTING keys in storage (no new key generation).
   * Used by replenishPreKeysIfNeeded and rotateSignedPreKey to avoid duplicating keys.
   */
  static async buildPreKeyBundleFromExisting(userId: string, deviceId: number): Promise<{
    registrationId: number;
    deviceId: number;
    preKeyId: number;
    preKeyPublic: string;
    signedPreKeyId: number;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    identityKey: string;
    oneTimePreKeys: Array<{ id: number; publicKey: string }>;
  }> {
    const store = this.getStore(userId, deviceId);
    const registrationId = (await store.getLocalRegistrationId()) || (KeyHelper.generateRegistrationId() || 1);

    const identityKeyPair = await store.getIdentityKeyPair();
    if (!identityKeyPair) {
      throw new Error('Identity key not found');
    }

    // Get the base pre-key (the first one)
    const db = await offlineStorage.getDB();
    let basePreKeyId = 0;
    let basePreKeyPair: { keyId: number; keyPair: { privKey: ArrayBuffer; pubKey: ArrayBuffer } } | null = null;
    await new Promise<void>((resolve, reject) => {
      const txn = db.transaction('pre_keys', 'readonly');
      const store = txn.objectStore('pre_keys');
      const index = store.index('deviceId');
      const range = IDBKeyRange.only(deviceId);
      const req = index.openCursor(range);
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) {
          basePreKeyId = cursor.value.preKeyId;
          basePreKeyPair = {
            keyId: cursor.value.preKeyId,
            keyPair: { privKey: cursor.value.privKey, pubKey: cursor.value.pubKey }
          };
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });

    if (!basePreKeyPair) {
      throw new Error('No base pre-key found');
    }
    const basePreKey = basePreKeyPair as { keyId: number; keyPair: { privKey: ArrayBuffer; pubKey: ArrayBuffer } };

    // Get the latest signed pre-key
    const signedPreKeyRecord = await store.loadSignedPreKey(1);
    const signature = await store.loadSignedPreKeySignature(1);
    if (!signedPreKeyRecord || !signature) {
      throw new Error('Signed pre-key not found');
    }
    const signedPreKeyPair: SignedPreKeyPairType = {
      keyId: 1,
      keyPair: signedPreKeyRecord,
      signature
    };

    const toB64 = (ab: ArrayBuffer) => btoa(String.fromCharCode(...Array.from(new Uint8Array(ab))));

    // Get ALL one-time pre-keys from storage
    const oneTimePreKeys: Array<{ id: number; publicKey: string }> = [];
    await new Promise<void>((resolve, reject) => {
      const txn = db.transaction('pre_keys', 'readonly');
      const store = txn.objectStore('pre_keys');
      const index = store.index('deviceId');
      const range = IDBKeyRange.only(deviceId);
      const req = index.openCursor(range);
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value;
          // Include all pre-keys (including the base one)
          oneTimePreKeys.push({
            id: record.preKeyId,
            publicKey: toB64(record.pubKey)
          });
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });

    const result = {
      registrationId,
      deviceId,
      preKeyId: basePreKeyId,
      preKeyPublic: toB64(basePreKey.keyPair.pubKey),
      signedPreKeyId: signedPreKeyPair.keyId,
      signedPreKeyPublic: toB64(signedPreKeyPair.keyPair.pubKey),
      signedPreKeySignature: toB64(signedPreKeyPair.signature),
      identityKey: toB64(identityKeyPair.pubKey),
      oneTimePreKeys,
    };
    return result;
  }

  /**
   * Check the number of available one-time pre-keys in local storage.
   * Returns the count of unused pre-keys.
   */
  static async getPreKeyCount(userId: string, deviceId: number): Promise<number> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('pre_keys', 'readonly');
      const store = txn.objectStore('pre_keys');
      const index = store.index('deviceId');
      const range = IDBKeyRange.only(deviceId);
      const req = index.count(range);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Check if signed pre-key needs rotation (older than 7 days).
   * Returns true if rotation is needed.
   */
  static async needsSignedPreKeyRotation(userId: string, deviceId: number): Promise<boolean> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('signed_pre_keys', 'readonly');
      const store = txn.objectStore('signed_pre_keys');
      const index = store.index('deviceId');
      const range = IDBKeyRange.only(deviceId);
      const req = index.openCursor(range);
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) {
          const record = cursor.value;
          const createdAt = record.createdAt ? new Date(record.createdAt).getTime() : 0;
          const age = Date.now() - createdAt;
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          resolve(age > sevenDays);
        } else {
          // No signed pre-key exists, needs creation
          resolve(true);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Replenish one-time pre-keys if count falls below threshold.
   * Generates new pre-keys and publishes updated bundle to server.
   */
  static async replenishPreKeysIfNeeded(
    userId: string,
    deviceId: number,
    threshold: number = 20,
    targetCount: number = 100
  ): Promise<boolean> {
    const currentCount = await this.getPreKeyCount(userId, deviceId);
    if (currentCount >= threshold) {
      return false; // No replenishment needed
    }

    console.log(`[E2EE] Pre-key count (${currentCount}) below threshold (${threshold}), replenishing to ${targetCount}`);

    // Generate new pre-key bundle with additional keys
    const store = this.getStore(userId, deviceId);
    const identityKeyPair = await store.getIdentityKeyPair();
    if (!identityKeyPair) {
      throw new Error('Identity key not found for pre-key replenishment');
    }

    // Get the highest existing pre-key ID to continue from there
    const db = await offlineStorage.getDB();
    let maxPreKeyId = 0;
    await new Promise<void>((resolve, reject) => {
      const txn = db.transaction('pre_keys', 'readonly');
      const store = txn.objectStore('pre_keys');
      const index = store.index('deviceId');
      const range = IDBKeyRange.only(deviceId);
      const req = index.openCursor(range);
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) {
          maxPreKeyId = Math.max(maxPreKeyId, cursor.value.preKeyId);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });

    const toB64 = (ab: ArrayBuffer) => btoa(String.fromCharCode(...Array.from(new Uint8Array(ab))));

    // Generate additional pre-keys
    const additionalKeys = targetCount - currentCount;
    const oneTimePreKeys = [];
    for (let i = 0; i < additionalKeys; i++) {
      const otpk: PreKeyPairType = await KeyHelper.generatePreKey(maxPreKeyId + i + 1);
      await store.storePreKey(otpk.keyId, otpk.keyPair);
      oneTimePreKeys.push({
        id: otpk.keyId,
        publicKey: toB64(otpk.keyPair.pubKey)
      });
    }

    // Build bundle from existing keys (including newly added) and publish
    const bundle = await this.buildPreKeyBundleFromExisting(userId, deviceId);
    await ApiService.publishPreKeyBundle({
      registrationId: bundle.registrationId,
      deviceId: bundle.deviceId,
      preKeyId: bundle.preKeyId,
      preKeyPublic: bundle.preKeyPublic,
      signedPreKeyId: bundle.signedPreKeyId,
      signedPreKeyPublic: bundle.signedPreKeyPublic,
      signedPreKeySignature: bundle.signedPreKeySignature,
      identityKey: bundle.identityKey,
      oneTimePreKeys: bundle.oneTimePreKeys,
    });

    return true;
  }

  /**
   * Rotate the signed pre-key (generate new one, publish updated bundle).
   * Should be called every 7 days.
   */
  static async rotateSignedPreKey(userId: string, deviceId: number): Promise<void> {
    console.log('[E2EE] Rotating signed pre-key');

    const store = this.getStore(userId, deviceId);
    const identityKeyPair = await store.getIdentityKeyPair();
    if (!identityKeyPair) {
      throw new Error('Identity key not found for signed pre-key rotation');
    }

    // Generate new signed pre-key with incremented key ID
    const db = await offlineStorage.getDB();
    let maxSignedPreKeyId = 0;
    await new Promise<void>((resolve, reject) => {
      const txn = db.transaction('signed_pre_keys', 'readonly');
      const store = txn.objectStore('signed_pre_keys');
      const index = store.index('deviceId');
      const range = IDBKeyRange.only(deviceId);
      const req = index.openCursor(range);
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) {
          maxSignedPreKeyId = Math.max(maxSignedPreKeyId, cursor.value.signedPreKeyId);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });

    const newSignedPreKeyId = maxSignedPreKeyId + 1;
    const signedPreKeyPair: SignedPreKeyPairType = await KeyHelper.generateSignedPreKey(identityKeyPair, newSignedPreKeyId);
    await store.storeSignedPreKey(signedPreKeyPair.keyId, signedPreKeyPair.keyPair);
    await store.storeSignedPreKeySignature(signedPreKeyPair.keyId, signedPreKeyPair.signature);

    // Remove old signed pre-key to keep only the latest
    if (maxSignedPreKeyId > 0) {
      await store.removeSignedPreKey(maxSignedPreKeyId);
    }

    // Build bundle from existing keys (including new signed pre-key) and publish
    const bundle = await this.buildPreKeyBundleFromExisting(userId, deviceId);
    await ApiService.publishPreKeyBundle({
      registrationId: bundle.registrationId,
      deviceId: bundle.deviceId,
      preKeyId: bundle.preKeyId,
      preKeyPublic: bundle.preKeyPublic,
      signedPreKeyId: bundle.signedPreKeyId,
      signedPreKeyPublic: bundle.signedPreKeyPublic,
      signedPreKeySignature: bundle.signedPreKeySignature,
      identityKey: bundle.identityKey,
      oneTimePreKeys: bundle.oneTimePreKeys,
    });
  }

  /**
   * Schedule automatic signed pre-key rotation every 7 days.
   * Returns a cleanup function to stop the timer.
   */
  static scheduleSignedPreKeyRotation(userId: string, deviceId: number): () => void {
    const intervalMs = 7 * 24 * 60 * 60 * 1000; // 7 days

    const checkAndRotate = async () => {
      try {
        const needsRotation = await this.needsSignedPreKeyRotation(userId, deviceId);
        if (needsRotation) {
          await this.rotateSignedPreKey(userId, deviceId);
        }
      } catch (err) {
        console.error('[E2EE] Failed to rotate signed pre-key:', err);
      }
    };

    // Run initial check
    checkAndRotate();

    // Set up interval
    const intervalId = setInterval(checkAndRotate, intervalMs);

    return () => clearInterval(intervalId);
  }

  /**
   * Schedule automatic pre-key replenishment check every hour.
   * Returns a cleanup function to stop the timer.
   */
  static schedulePreKeyReplenishment(
    userId: string,
    deviceId: number,
    threshold: number = 20,
    targetCount: number = 100
  ): () => void {
    const intervalMs = 60 * 60 * 1000; // 1 hour

    const checkAndReplenish = async () => {
      try {
        await this.replenishPreKeysIfNeeded(userId, deviceId, threshold, targetCount);
      } catch (err) {
        console.error('[E2EE] Failed to replenish pre-keys:', err);
      }
    };

    // Run initial check
    checkAndReplenish();

    // Set up interval
    const intervalId = setInterval(checkAndReplenish, intervalMs);

    return () => clearInterval(intervalId);
  }

  static async getSessionRecord(userId: string, deviceId: number, remoteAddress: SignalProtocolAddress): Promise<string | undefined> {
    const store = this.getStore(userId, deviceId);
    return store.loadSession(remoteAddress.toString());
  }

  static async storeSessionRecord(userId: string, deviceId: number, remoteAddress: SignalProtocolAddress, record: string): Promise<void> {
    const store = this.getStore(userId, deviceId);
    return store.storeSession(remoteAddress.toString(), record);
  }

  /**
   * Clear pendingPreKey from session record after a successful pre-key message encryption.
   * The library sets pendingPreKey during session establishment but doesn't clear it after
   * the first pre-key message is sent. We must clear it to prevent subsequent messages
   * from incorrectly being sent as pre-key messages.
   * Runs within SessionLock to prevent race conditions with concurrent encryptions.
   * Uses the same lock key format as the library: remoteAddress.toString() (name.deviceId).
   */
  static async clearPendingPreKey(userId: string, deviceId: number, remoteAddress: SignalProtocolAddress): Promise<void> {
    const lockKey = remoteAddress.toString(); // library uses name.deviceId format
    const encodedAddress = `${remoteAddress.getName()}:${remoteAddress.getDeviceId()}`; // storage uses name:deviceId
    // Use SessionLock to serialize with concurrent encryptions for the same remote address
    await SessionLock.queueJobForNumber(lockKey, async () => {
      const store = this.getStore(userId, deviceId);
      const serialized = await store.loadSession(encodedAddress);
      if (!serialized) return;

      const record = SessionRecord.deserialize(serialized);
      let modified = false;
      for (const key of Object.keys(record.sessions)) {
        const session = record.sessions[key];
        if (session.pendingPreKey !== undefined) {
          delete session.pendingPreKey;
          modified = true;
        }
      }
      if (modified) {
        await store.storeSession(encodedAddress, record.serialize());
      }
    });
  }

  static async encrypt(userId: string, deviceId: number, remoteAddress: SignalProtocolAddress, plaintext: string): Promise<string> {
    const store = this.getStore(userId, deviceId);
    const cipher = new SessionCipher(store, remoteAddress);
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = await cipher.encrypt(plaintextBytes.buffer);
    // If this was a pre-key message (type 3), clear pendingPreKey from the session record
    // to prevent subsequent messages from incorrectly being sent as pre-key messages.
    // Preserve pre-key envelopes until the peer acknowledges the session.
    // ciphertext is MessageType { type, body, registrationId }
    // Serialize as base64 JSON
    const bodyArray = typeof ciphertext.body === 'string'
      ? Array.from(ciphertext.body, c => c.charCodeAt(0))
      : Array.from(new Uint8Array(ciphertext.body as unknown as ArrayBuffer));
    const msgJson = JSON.stringify({ type: ciphertext.type, body: bodyArray, registrationId: ciphertext.registrationId ?? 0 });
    return btoa(msgJson);
  }

  static async decrypt(userId: string, deviceId: number, remoteAddress: SignalProtocolAddress, ciphertextB64: string): Promise<string> {
    const store = this.getStore(userId, deviceId);
    const cipher = new SessionCipher(store, remoteAddress);
    const msgObj = JSON.parse(atob(ciphertextB64));
    const bodyBytes = new Uint8Array(msgObj.body).buffer;
    const plaintext = msgObj.type === 3
      ? await cipher.decryptPreKeyWhisperMessage(bodyBytes)
      : await cipher.decryptWhisperMessage(bodyBytes);
    return new TextDecoder().decode(plaintext);
  }

  static async getRemoteIdentityKey(userId: string, peerUserId: string, deviceId: number = 1): Promise<ArrayBuffer | null> {
    try {
      const response = await ApiService.getPreKeyBundle(peerUserId, deviceId);
      const b64 = response.bundle.identityKey;
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      return null;
    }
  }

  // Helper to publish identity key and prekeys to server
  static async publishPreKeyBundle(userId: string, deviceId: number, options: { preKeyCount?: number } = {}): Promise<void> {
    const bundle = await this.generatePreKeyBundle(userId, deviceId, options);
    const { devices } = await ApiService.listDevices();
    if (!devices.some(d => d.deviceId === deviceId)) {
      await ApiService.registerDevice(deviceId, 'Web browser', bundle.identityKey);
    }
    await ApiService.publishPreKeyBundle({
      registrationId: bundle.registrationId,
      deviceId: bundle.deviceId,
      preKeyId: bundle.preKeyId,
      preKeyPublic: bundle.preKeyPublic,
      signedPreKeyId: bundle.signedPreKeyId,
      signedPreKeyPublic: bundle.signedPreKeyPublic,
      signedPreKeySignature: bundle.signedPreKeySignature,
      identityKey: bundle.identityKey,
      oneTimePreKeys: bundle.oneTimePreKeys,
    });
  }

  static async ensureSession(userId: string, deviceId: number, remoteUserId: string, remoteDeviceId: number = 1): Promise<boolean> {
    const store = this.getStore(userId, deviceId);

    const remoteAddr = new SignalProtocolAddress(remoteUserId, remoteDeviceId);
    const existingRecord = await this.getSessionRecord(userId, deviceId, remoteAddr);
    if (existingRecord) {
      return false;
    }

    // Publish our bundle first with 100+ pre-keys
    await this.publishPreKeyBundle(userId, deviceId, { preKeyCount: 100 });

    // Fetch remote user's pre-key bundle
    let response;
    try {
      response = await ApiService.getPreKeyBundle(remoteUserId, remoteDeviceId);
    } catch (err: any) {
      // If peer has no pre-key bundle (404), throw a specific error for queuing
      if (err.message?.includes('404') || err.message?.includes('Not Found') || err.message?.includes('no pre-key bundle')) {
        const { PeerKeysNotPublishedError } = await import('./e2ee');
        throw new PeerKeysNotPublishedError(remoteUserId, remoteDeviceId);
      }
      throw err;
    }
    const bundle = response.bundle;

    const sessionBuilder = new SessionBuilder(store, remoteAddr);

    await sessionBuilder.processPreKey({
      identityKey: this.b64ToArrayBuffer(bundle.identityKey),
      signedPreKey: {
        keyId: bundle.signedPreKeyId,
        publicKey: this.b64ToArrayBuffer(bundle.signedPreKeyPublic),
        signature: this.b64ToArrayBuffer(bundle.signedPreKeySignature),
      },
      preKey: {
        keyId: bundle.preKeyId,
        publicKey: this.b64ToArrayBuffer(bundle.preKeyPublic),
      },
      registrationId: bundle.registrationId,
    } as DeviceType);

    return true;
  }

  static async processPreKeyMessage(userId: string, deviceId: number, remoteUserId: string, remoteDeviceId: number, message: any): Promise<void> {
    const remoteAddr = new SignalProtocolAddress(remoteUserId, remoteDeviceId);
    const existingRecord = await this.getSessionRecord(userId, deviceId, remoteAddr);
    if (existingRecord) {
      return;
    }

    const sessionBuilder = new SessionBuilder(this.getStore(userId, deviceId), remoteAddr);

    await sessionBuilder.processPreKey({
      identityKey: this.b64ToArrayBuffer(message.identityKey),
      signedPreKey: {
        keyId: message.signedPreKeyId,
        publicKey: this.b64ToArrayBuffer(message.signedPreKeyPublic),
        signature: this.b64ToArrayBuffer(message.signedPreKeySignature),
      },
      preKey: {
        keyId: message.preKeyId,
        publicKey: this.b64ToArrayBuffer(message.preKeyPublic),
      },
      registrationId: message.registrationId,
    } as DeviceType);
  }

  private static b64ToArrayBuffer(b64: string): ArrayBuffer {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /** Compute the safety number for a peer device using Signal protocol identity keys. */
  static async computeSafetyNumber(myUserId: string, myDeviceId: number, peerUserId: string, peerDeviceId: number = 1): Promise<string | null> {
    const store = this.getStore(myUserId, myDeviceId);
    return store.computeSafetyNumber(peerUserId, peerDeviceId);
  }

  /** Check if a peer device has been explicitly verified by the user. */
  static async isPeerVerified(myUserId: string, myDeviceId: number, peerUserId: string, peerDeviceId: number = 1): Promise<boolean> {
    const store = this.getStore(myUserId, myDeviceId);
    return store.isPeerVerified(peerUserId, peerDeviceId);
  }

  /** Set the verification status for a peer device. */
  static async setPeerVerified(myUserId: string, myDeviceId: number, peerUserId: string, peerDeviceId: number, verified: boolean): Promise<void> {
    const store = this.getStore(myUserId, myDeviceId);
    return store.setPeerVerified(peerUserId, peerDeviceId, verified);
  }

  /** Get the local device's Signal identity key (Ed25519 public key). */
  static async getLocalIdentityKey(userId: string, deviceId: number): Promise<ArrayBuffer | null> {
    const store = this.getStore(userId, deviceId);
    return store.getLocalIdentityKey();
  }

  /** Get a peer's Signal identity key. */
  static async getPeerIdentityKey(userId: string, deviceId: number, peerUserId: string, peerDeviceId: number = 1): Promise<ArrayBuffer | null> {
    const store = this.getStore(userId, deviceId);
    return store.getPeerIdentityKey(peerUserId, peerDeviceId);
  }

  /** Compute the safety number for a peer device. */
  static async getSafetyNumber(myUserId: string, myDeviceId: number, peerUserId: string, peerDeviceId: number = 1): Promise<string | null> {
    const store = this.getStore(myUserId, myDeviceId);
    return store.computeSafetyNumber(peerUserId, peerDeviceId);
  }

  /** Get all registered devices for a user. */
  static async getDevices(userId: string): Promise<Array<{deviceId: number; deviceName: string | null; publicKey: string; isRevoked: boolean}>> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('devices', 'readonly');
      const store = txn.objectStore('devices');
      const req = store.getAll();
      req.onsuccess = () => {
        const devices = req.result || [];
        const userDevices = devices.filter(d => d.userId === userId);
        resolve(userDevices.map(d => ({
          deviceId: d.deviceId,
          deviceName: d.deviceName,
          publicKey: d.publicKey,
          isRevoked: d.isRevoked
        })));
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** Register a new device for the current user. */
  static async registerDevice(userId: string, deviceId: number, deviceName: string | null, publicKey: string): Promise<void> {
    await offlineStorage.getDB().then(db => new Promise<void>((resolve, reject) => {
      const txn = db.transaction('devices', 'readwrite');
      const store = txn.objectStore('devices');
      store.put({ id: `${userId}:${deviceId}`, userId, deviceId, deviceName, publicKey, isRevoked: false, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    }));
  }

  /** Revoke a device. */
  static async revokeDevice(userId: string, deviceId: number): Promise<void> {
    // Clear device-specific data from IndexedDB
    await offlineStorage.clearDeviceData(deviceId);

    // Stop scheduled tasks for this device
    const { E2EEService } = await import('./e2ee');
    E2EEService.stopScheduledTasks(userId, deviceId);

    // Call backend to revoke
    await ApiService.revokeDevice(deviceId);
  }

  /** List all registered devices for the current user. */
  static async listDevices(userId: string): Promise<Array<{deviceId: number; deviceName: string | null; publicKey: string; isRevoked: boolean}>> {
    return (await ApiService.listPeerDevices(userId)).devices;
  }

  // =============================================================================
  // History Transfer Methods
  // =============================================================================

  /**
   * Derive the history transfer session key using HKDF.
   * Both devices perform this identically after authorization.
   * 
   * Key derivation:
   *   shared_secret = X25519(source_ephemeral_priv, dest_identity_pub) || X25519(dest_ephemeral_priv, source_identity_pub)
   *   transfer_key = HKDF-SHA256(salt=transfer_id, IKM=shared_secret, info="history-transfer-v1", length=64)
   * Returns { encKey: 32 bytes, authKey: 32 bytes }
   */
  static async deriveTransferKey(
    myUserId: string,
    myDeviceId: number,
    transferId: string,
    sourceEphemeralPubKey: Buffer,
    destEphemeralPubKey: Buffer,
    sourceIdentityPubKey: Buffer,
    destIdentityPubKey: Buffer,
    isSource: boolean
  ): Promise<{ encKey: Uint8Array; authKey: Uint8Array }> {
    const store = this.getStore(myUserId, isSource ? myDeviceId : 0);
    
    // Get our ephemeral private key (generated during authorization)
    // For now, we need to retrieve it from storage
    // In a full implementation, we'd store the ephemeral private key during authorization
    
    // Get the peer's identity public key
    const peerIdentityPubKey = isSource ? destIdentityPubKey : sourceIdentityPubKey;
    
    // Get our ephemeral private key from storage
    const myEphemeralPrivKey = await this.getTransferEphemeralPrivateKey(myUserId, isSource ? myDeviceId : 0, transferId);
    
    // Derive shared secret using X25519
    // shared_secret = X25519(my_ephemeral_priv, peer_ephemeral_pub) || X25519(my_identity_priv, peer_ephemeral_pub)
    // For now, we'll use a simplified approach
    
    // Get our identity private key
    const myIdentityKeyPair = await store.getIdentityKeyPair();
    if (!myIdentityKeyPair) {
      throw new Error('Identity key not found');
    }
    
    // Import peer's ephemeral public key
    const peerEphemeralPubKey = isSource ? destEphemeralPubKey : sourceEphemeralPubKey;
    const peerEphemeralCryptoKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(peerEphemeralPubKey),
      { name: 'ECDH', namedCurve: 'X25519' },
      false,
      []
    );
    
    // Import our ephemeral private key
    const myEphemeralPrivCryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      new Uint8Array(myEphemeralPrivKey),
      { name: 'ECDH', namedCurve: 'X25519' },
      true,
      ['deriveBits']
    );
    
    // Derive first shared secret: X25519(my_ephemeral_priv, peer_ephemeral_pub)
    const sharedSecret1 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerEphemeralCryptoKey },
      myEphemeralPrivCryptoKey,
      256
);

// Import our identity private key
    const myIdentityPrivKey = await crypto.subtle.importKey(
      'pkcs8',
      myIdentityKeyPair.privKey,
      { name: 'ECDH', namedCurve: 'X25519' },
      true,
      ['deriveBits']
);
    
    // Import peer's identity public key for second derivation
    const peerIdentityCryptoKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(peerIdentityPubKey),
      { name: 'ECDH', namedCurve: 'X25519' },
      false,
      []
    );
    
    // Derive second shared secret: X25519(my_identity_priv, peer_identity_pub)
    const sharedSecret2 = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerIdentityCryptoKey },
      myIdentityPrivKey,
      256
    );
    
    // Combine shared secrets
    const combinedSecret = new Uint8Array(sharedSecret1.byteLength + sharedSecret2.byteLength);
    combinedSecret.set(new Uint8Array(sharedSecret1), 0);
    combinedSecret.set(new Uint8Array(sharedSecret2), sharedSecret1.byteLength);
    
    // HKDF-SHA256 to derive encryption and auth keys
    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      combinedSecret,
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );
    
    const derivedKey = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(transferId),
        info: new TextEncoder().encode('history-transfer-v1')
      },
      hkdfKey,
      512 // 64 bytes = 32 enc + 32 auth
    );
    
    const derived = new Uint8Array(derivedKey);
    const encKey = derived.slice(0, 32);
    const authKey = derived.slice(32, 64);
    
    // Store transfer key in IndexedDB for later use
    await offlineStorage.saveHistoryTransfer({
      transferId: transferId,
      userId: '', // will be set by caller
      role: 'source', // will be set by caller
      status: 'active',
      partnerUserId: '', // will be set by caller
      partnerDeviceId: 0, // will be set by caller
      myDeviceId: 0, // will be set by caller
      transferKey: Array.from(new Uint8Array(derived)),
      policy: { include_groups: true, include_direct: true, date_range: null },
      totalBatches: 0,
      currentBatch: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    return { encKey, authKey };
  }

  /**
   * Get the ephemeral private key for a transfer from storage.
   * This should have been stored during authorization.
   */
  private static async getTransferEphemeralPrivateKey(userId: string, deviceId: number, transferId: string): Promise<ArrayBuffer> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('history_transfers', 'readonly');
      const store = txn.objectStore('history_transfers');
      const req = store.get(transferId);
      req.onsuccess = () => {
        const result = req.result;
        if (!result || !result.sourceEphemeralPrivKey) {
          return reject(new Error('Ephemeral private key not found for transfer'));
        }
        resolve(new Uint8Array(result.sourceEphemeralPrivKey).buffer);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Encrypt a history batch for transfer.
   * Returns base64-encoded envelope with IV, ciphertext, and auth tag.
   */
  static async encryptHistoryBatch(
    transferId: string,
    batchSeq: number,
    messages: Array<{
      message_id: string;
      chat_id: string;
      sender_id: string;
      type: string;
      content: string;
      timestamp: string;
      reply_to?: string | null;
      forwarded_from?: { message_id: string; sender_id: string } | null;
    }>,
    transferKey: Uint8Array
  ): Promise<string> {
    // Serialize messages
    const plaintextObj = {
      batch_seq: batchSeq,
      messages: messages.map(m => ({
        message_id: m.message_id,
        chat_id: m.chat_id,
        sender_id: m.sender_id,
        type: m.type,
        content: m.content,
        timestamp: m.timestamp,
        reply_to: m.reply_to || null,
        forwarded_from: m.forwarded_from || null
      })),
      total_batches: 0 // will be set by caller
    };
    const plaintext = JSON.stringify(plaintextObj);
    
    // AES-256-GCM encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(transferKey.slice(0, 32)),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    
    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(transferId + ':' + batchSeq) },
      key,
      plaintextBytes
    );
    
    const ciphertextArray = new Uint8Array(ciphertext);
    const tag = ciphertextArray.slice(-16);
    const ct = ciphertextArray.slice(0, -16);
    
    // Encode as base64: IV || ciphertext || tag
    const envelope = new Uint8Array(12 + ct.length + 16);
    envelope.set(iv, 0);
    envelope.set(ct, 12);
    envelope.set(tag, 12 + ct.length);
    
    return btoa(String.fromCharCode(...envelope));
  }

  /**
   * Decrypt a history batch from transfer.
   */
  static async decryptHistoryBatch(
    envelopeB64: string,
    transferId: string,
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
    const envelope = new Uint8Array(Uint8Array.from(atob(envelopeB64), c => c.charCodeAt(0)));
    
    if (envelope.length < 12 + 16) {
      throw new Error('Invalid envelope: too short');
    }
    
    const iv = envelope.slice(0, 12);
    const tag = envelope.slice(-16);
    const ct = envelope.slice(12, -16);
    
    // Reconstruct ciphertext with tag at end for Web Crypto
    const ciphertext = new Uint8Array(ct.length + 16);
    ciphertext.set(ct, 0);
    ciphertext.set(tag, ct.length);
    
    const key = await crypto.subtle.importKey(
      'raw',
      transferKey.slice(0, 32),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(transferId + ':' + expectedBatchSeq) },
        key,
        ciphertext
      );
      
      const plaintextStr = new TextDecoder().decode(plaintext);
      const parsed = JSON.parse(plaintextStr);
      
      if (parsed.batch_seq !== expectedBatchSeq) {
        throw new Error(`Batch sequence mismatch: expected ${expectedBatchSeq}, got ${parsed.batch_seq}`);
      }
      
      return parsed;
    } catch (err) {
      throw new Error(`Failed to decrypt batch: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  /**
   * Store ephemeral private key for a transfer.
   * Called during authorization.
   */
  static async storeTransferEphemeralKeys(
    transferId: string,
    userId: string,
    deviceId: number,
    isSource: boolean,
    sourceEphemeralPrivKey?: ArrayBuffer,
    destEphemeralPubKey?: Uint8Array
  ): Promise<void> {
    await offlineStorage.saveHistoryTransfer({
      transferId,
      userId,
      role: isSource ? 'source' : 'dest',
      status: 'pending',
      partnerUserId: '', // will be filled by caller
      partnerDeviceId: 0, // will be filled by caller
      myDeviceId: deviceId,
      sourceEphemeralPrivKey: sourceEphemeralPrivKey ? Array.from(new Uint8Array(sourceEphemeralPrivKey)) : undefined,
      destEphemeralPubKey: destEphemeralPubKey ? Array.from(destEphemeralPubKey) : undefined,
      transferKey: [],
      policy: { include_groups: true, include_direct: true, date_range: null },
      totalBatches: 0,
      currentBatch: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Get stored transfer state.
   */
  static async getTransferState(transferId: string): Promise<any | null> {
    return offlineStorage.getHistoryTransfer(transferId);
  }

  /**
   * Update transfer progress.
   */
  static async updateTransferProgress(
    transferId: string,
    updates: { currentBatch?: number; totalBatches?: number; status?: string; transferKey?: Uint8Array }
  ): Promise<void> {
    const existing = await offlineStorage.getHistoryTransfer(transferId);
    if (!existing) return;
    
    await offlineStorage.saveHistoryTransfer({
      ...existing,
      ...updates,
      transferKey: updates.transferKey ? Array.from(updates.transferKey) : existing.transferKey,
      updatedAt: new Date().toISOString()
    });
  }
}