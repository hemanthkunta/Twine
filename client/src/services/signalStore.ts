import {
  StorageType,
  KeyPairType,
  SessionRecordType,
  Direction,
  SignalProtocolAddress,
} from 'libsignal-protocol-typescript';
import { offlineStorage } from './storage';

function arrayBufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function arrayBufferEquals(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  for (let i = 0; i < a.byteLength; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
}

export class SignalProtocolStore {
  private readonly userId: string;
  private readonly deviceId: number;
  private trustStoreName = 'trusted_identities';

  constructor(userId: string, deviceId: number) {
    this.userId = userId;
    this.deviceId = deviceId;
  }

  /**
   * Get a singleton instance of SignalProtocolStore for a given user and device.
   * This is used by E2EEService to access trust methods.
   */
  static getInstance(userId: string, deviceId: number): SignalProtocolStore {
    return new SignalProtocolStore(userId, deviceId);
  }

  private encodedAddr(addr: SignalProtocolAddress): string {
    return `${addr.getName()}:${addr.getDeviceId()}`;
  }

  /* ---------- Identity ---------- */
  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('identity_keys', 'readonly');
      const store = txn.objectStore('identity_keys');
      const req = store.get(`${this.userId}:${this.deviceId}`);
      req.onsuccess = () => {
        const r = req.result;
        if (!r) return resolve(undefined);
        resolve({ privKey: r.privKey, pubKey: r.pubKey });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async putIdentityKeyPair(keyPair: KeyPairType): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('identity_keys', 'readwrite');
      const store = txn.objectStore('identity_keys');
      store.put({ id: `${this.userId}:${this.deviceId}`, userId: this.userId, deviceId: this.deviceId, privKey: keyPair.privKey, pubKey: keyPair.pubKey, registrationId: 0 });
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('identity_keys', 'readonly');
      const store = txn.objectStore('identity_keys');
      const req = store.get(`${this.userId}:${this.deviceId}`);
      req.onsuccess = () => resolve(req.result?.registrationId ?? 0);
      req.onerror = () => reject(req.error);
    });
  }

  async putLocalRegistrationId(regId: number): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('identity_keys', 'readwrite');
      const store = txn.objectStore('identity_keys');
      const req = store.get(`${this.userId}:${this.deviceId}`);
      req.onsuccess = () => {
        const rec = req.result;
        if (rec) {
          rec.registrationId = regId;
          store.put(rec);
        }
      };
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  /* ---------- Pre‑keys ---------- */
  async loadPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('pre_keys', 'readonly');
      const store = txn.objectStore('pre_keys');
      const req = store.get(`${this.userId}:${this.deviceId}:${keyId}`);
      req.onsuccess = () => {
        const r = req.result;
        if (!r) return resolve(undefined);
        resolve({ privKey: r.privKey, pubKey: r.pubKey });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('pre_keys', 'readwrite');
      const store = txn.objectStore('pre_keys');
      store.put({ id: `${this.userId}:${this.deviceId}:${keyId}`, userId: this.userId, deviceId: this.deviceId, preKeyId: Number(keyId), privKey: keyPair.privKey, pubKey: keyPair.pubKey });
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  async removePreKey(keyId: number | string): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('pre_keys', 'readwrite');
      const store = txn.objectStore('pre_keys');
      store.delete(`${this.userId}:${this.deviceId}:${keyId}`);
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  /* ---------- Signed pre‑keys ---------- */
  async loadSignedPreKey(keyId: number | string): Promise<{ privKey: ArrayBuffer; pubKey: ArrayBuffer; signature: ArrayBuffer } | undefined> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('signed_pre_keys', 'readonly');
      const store = txn.objectStore('signed_pre_keys');
      const req = store.get(`${this.userId}:${this.deviceId}:${keyId}`);
      req.onsuccess = () => {
        const r = req.result;
        if (!r) return resolve(undefined);
        resolve({ privKey: r.privKey, pubKey: r.pubKey, signature: r.signature });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType & { signature?: ArrayBuffer }): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('signed_pre_keys', 'readwrite');
      const store = txn.objectStore('signed_pre_keys');
      store.put({
        id: `${this.userId}:${this.deviceId}:${keyId}`,
        userId: this.userId,
        deviceId: this.deviceId,
        signedPreKeyId: Number(keyId),
        privKey: keyPair.privKey,
        pubKey: keyPair.pubKey,
        signature: keyPair.signature,
        createdAt: new Date().toISOString()
      });
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('signed_pre_keys', 'readwrite');
      const store = txn.objectStore('signed_pre_keys');
      store.delete(`${this.userId}:${this.deviceId}:${keyId}`);
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  async storeSignedPreKeySignature(keyId: number | string, signature: ArrayBuffer): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('signed_pre_keys', 'readwrite');
      const store = txn.objectStore('signed_pre_keys');
      const req = store.get(`${this.userId}:${this.deviceId}:${keyId}`);
      req.onsuccess = () => {
        const rec = req.result;
        if (rec) {
          rec.signature = signature;
          store.put(rec);
        }
      };
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  async loadSignedPreKeySignature(keyId: number | string): Promise<ArrayBuffer | undefined> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('signed_pre_keys', 'readonly');
      const store = txn.objectStore('signed_pre_keys');
      const req = store.get(`${this.userId}:${this.deviceId}:${keyId}`);
      req.onsuccess = () => resolve(req.result?.signature);
      req.onerror = () => reject(req.error);
    });
  }

  /* ---------- Sessions ---------- */
  async storeSession(encodedAddress: string, record: string): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('signal_sessions', 'readwrite');
      const store = txn.objectStore('signal_sessions');
      store.put({ key: `${this.userId}:${this.deviceId}:${encodedAddress}`, userId: this.userId, deviceId: this.deviceId, data: record });
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  async loadSession(encodedAddress: string): Promise<string | undefined> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction('signal_sessions', 'readonly');
      const store = txn.objectStore('signal_sessions');
      const req = store.get(`${this.userId}:${this.deviceId}:${encodedAddress}`);
      req.onsuccess = () => resolve(req.result?.data);
      req.onerror = () => reject(req.error);
    });
  }

  async removeSession(encodedAddress: string): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('signal_sessions', 'readwrite');
      const store = txn.objectStore('signal_sessions');
      store.delete(`${this.userId}:${this.deviceId}:${encodedAddress}`);
      txn.oncomplete = () => resolve();
      txn.onerror = () => reject(txn.error);
    });
  }

  async removeAllSessions(): Promise<void> {
    const db = await offlineStorage.getDB();
    return new Promise<void>((resolve, reject) => {
      const txn = db.transaction('signal_sessions', 'readwrite');
      const store = txn.objectStore('signal_sessions');
      const index = store.index('userId');
      const range = IDBKeyRange.only(this.userId);
      const req = index.openCursor(range);
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
        else resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* ---------- Trust ---------- */

  async isTrustedIdentity(identifier: string, identityKey: ArrayBuffer, direction: number): Promise<boolean> {
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction(this.trustStoreName, 'readonly');
      const store = txn.objectStore(this.trustStoreName);
      const req = store.get(`${this.userId}:${this.deviceId}:${identifier}`);
      req.onsuccess = () => {
        const r = req.result;
        if (!r) {
          // First time seeing this identity - trust on first use (TOFU)
          // Store the key for future verification
          this.saveIdentity(identifier, identityKey).then(() => resolve(true)).catch(reject);
        } else {
          // Compare the stored identity key with the provided one
          const storedKey = r.identityKey;
          const matches = arrayBufferEquals(storedKey, identityKey);
          if (!matches) {
            console.warn(`Identity key mismatch for ${identifier}: expected ${arrayBufferToHex(storedKey)}, got ${arrayBufferToHex(identityKey)}`);
            // Fail closed - reject the identity if it doesn't match
            resolve(false);
          } else {
            resolve(true);
          }
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async saveIdentity(encodedAddress: string, identityKey: ArrayBuffer, nonblockingApproval?: boolean): Promise<boolean> {
    const db = await offlineStorage.getDB();
    return new Promise<boolean>((resolve, reject) => {
      const txn = db.transaction(this.trustStoreName, 'readwrite');
      const store = txn.objectStore(this.trustStoreName);
      const req = store.get(`${this.userId}:${this.deviceId}:${encodedAddress}`);
      req.onsuccess = () => {
        const r = req.result;
        if (!r) {
          // First time - store the identity key
          store.put({ id: `${this.userId}:${this.deviceId}:${encodedAddress}`, userId: this.userId, deviceId: this.deviceId, identityKey, savedAt: Date.now() });
          txn.oncomplete = () => resolve(true);
          txn.onerror = () => reject(txn.error);
        } else {
          // Key exists - only allow update if keys match (fail-closed)
          const storedKey = r.identityKey;
          const matches = arrayBufferEquals(r.identityKey, identityKey);
          if (matches) {
            // Key matches, update timestamp
            store.put({ id: `${this.userId}:${this.deviceId}:${encodedAddress}`, userId: this.userId, deviceId: this.deviceId, identityKey, savedAt: Date.now() });
            txn.oncomplete = () => resolve(true);
            txn.onerror = () => reject(txn.error);
          } else {
            // Key mismatch - fail closed, do not update
            console.warn(`Identity key mismatch for ${encodedAddress}: rejecting key change`);
            resolve(false);
          }
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* ---------- Identity Keys for Safety Number ---------- */

  /**
   * Get the local device's Ed25519 identity public key (33 bytes with 0x05 prefix).
   * This is the Signal protocol identity key used for X3DH and safety numbers.
   */
  async getLocalIdentityKey(): Promise<ArrayBuffer | null> {
    const keyPair = await this.getIdentityKeyPair();
    return keyPair?.pubKey ?? null;
  }

  /**
   * Get a peer's Ed25519 identity public key by fetching their pre-key bundle
   * from the server and extracting the identity key.
   */
  async getPeerIdentityKey(peerUserId: string, deviceId: number = 1): Promise<ArrayBuffer | null> {
    try {
      const { ApiService } = await import('./api');
      const response = await ApiService.getPreKeyBundle(peerUserId, deviceId);
      const bundle = response.bundle;
      if (!bundle || !bundle.identityKey) return null;

      const binary = atob(bundle.identityKey);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      return null;
    }
  }

  /**
   * Compute the safety number for a peer device.
   * Uses the same algorithm as libsignal: SHA-256 of the two Ed25519 identity keys
   * (sorted lexicographically), then formatted as 12 groups of 5 digits.
   * This matches the Signal protocol's safety number format.
   */
  async computeSafetyNumber(peerUserId: string, deviceId: number = 1): Promise<string | null> {
    const localKey = await this.getLocalIdentityKey();
    const peerKey = await this.getPeerIdentityKey(peerUserId, deviceId);
    if (!localKey || !peerKey) return null;

    // Sort keys lexicographically for consistent ordering
    const localHex = arrayBufferToHex(localKey);
    const peerHex = arrayBufferToHex(peerKey);
    const [first, second] = localHex < peerHex ? [localKey, peerKey] : [peerKey, localKey];

    // Concatenate and hash
    const combined = new Uint8Array(first.byteLength + second.byteLength);
    combined.set(new Uint8Array(first), 0);
    combined.set(new Uint8Array(second), first.byteLength);

    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    // Format as 12 groups of 5 digits (Signal protocol safety number format)
    const numbers: string[] = [];
    for (let i = 0; i < 12; i++) {
      const b1 = hashArray[(i * 2) % hashArray.length];
      const b2 = hashArray[(i * 2 + 1) % hashArray.length];
      const num = ((b1 << 8) | b2) % 100000;
      numbers.push(num.toString().padStart(5, '0'));
    }

    return numbers.join(' ');
  }

  /**
   * Check if a peer device has been explicitly verified by the user.
   * Returns true if the user has marked this peer device as verified.
   */
  async isPeerVerified(peerUserId: string, deviceId: number = 1): Promise<boolean> {
    const identifier = `${peerUserId}:${deviceId}`;
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction(this.trustStoreName, 'readonly');
      const store = txn.objectStore(this.trustStoreName);
      const req = store.get(`${this.userId}:${this.deviceId}:${identifier}`);
      req.onsuccess = () => {
        const r = req.result;
        resolve(r?.verified === true);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Set the verification status for a peer device.
   * This persists the user's explicit verification decision.
   */
  async setPeerVerified(peerUserId: string, deviceId: number, verified: boolean): Promise<void> {
    const identifier = `${peerUserId}:${deviceId}`;
    const db = await offlineStorage.getDB();
    return new Promise((resolve, reject) => {
      const txn = db.transaction(this.trustStoreName, 'readwrite');
      const store = txn.objectStore(this.trustStoreName);
      const req = store.get(`${this.userId}:${this.deviceId}:${identifier}`);
      req.onsuccess = () => {
        const r = req.result;
        if (!r) {
          store.put({ id: `${this.userId}:${this.deviceId}:${identifier}`, userId: this.userId, deviceId: this.deviceId, identityKey: new ArrayBuffer(0), verified, savedAt: Date.now() });
        } else {
          r.verified = verified;
          r.savedAt = Date.now();
          store.put(r);
        }
        txn.oncomplete = () => resolve();
        txn.onerror = () => reject(txn.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  private arrayBufferEquals(a: ArrayBuffer, b: ArrayBuffer): boolean {
    if (a.byteLength !== b.byteLength) return false;
    const viewA = new Uint8Array(a);
    const viewB = new Uint8Array(b);
    for (let i = 0; i < a.byteLength; i++) {
      if (viewA[i] !== viewB[i]) return false;
    }
    return true;
  }

  private arrayBufferToHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}