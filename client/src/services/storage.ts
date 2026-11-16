import { Message, MeshPacket } from '../types/index';

const DB_NAME = 'aerogram_offline_db';
const DB_VERSION = 6; // Incremented for history transfer support

interface HistoryTransferRecord {
  transferId: string;
  userId: string;
  role: 'source' | 'dest';
  status: 'pending' | 'approved' | 'active' | 'completed' | 'failed' | 'cancelled' | 'expired';
  partnerUserId: string;
  partnerDeviceId: number;
  myDeviceId: number;
  challenge?: number[];
  challengeSignature?: number[];
  sourceEphemeralPubKey?: number[];
  destEphemeralPubKey?: number[];
  destEphemeralPrivKey?: number[];
  transferKey?: number[];
  policy: { include_groups: boolean; include_direct: boolean; date_range: { start?: string; end?: string } | null };
  totalBatches: number;
  currentBatch: number;
  createdAt: string;
  updatedAt: string;
}

class OfflineStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;
        const oldVersion = event.oldVersion;

        // 1. Local Cached Messages
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('chat_id', 'chat_id', { unique: false });
          msgStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // 2. Outbox for Store-and-Forward offline queue
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
          outboxStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // 3. Mesh Packet Deduplication Cache
        if (!db.objectStoreNames.contains('mesh_packets')) {
          const meshStore = db.createObjectStore('mesh_packets', { keyPath: 'packet_id' });
          meshStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 4. ECDH & Device Identity Keys Store (per device)
        if (!db.objectStoreNames.contains('identity_keys')) {
          const store = db.createObjectStore('identity_keys', { keyPath: 'id' });
          store.createIndex('userId', 'userId', { unique: false });
          store.createIndex('deviceId', 'deviceId', { unique: false });
        }

        // 5. Group Sender Key Ratchet State
        //
        // Holds this device's own send chain plus one receive chain per group peer,
        // including any message keys skipped by out-of-order arrival. This is
        // persistent state, not a cache: losing it means the device can no longer
        // read its own group history, so `clearUserData()` leaves it alone (see the
        // note on `identity_keys` there).
        if (!db.objectStoreNames.contains('sender_keys')) {
          const skStore = db.createObjectStore('sender_keys', { keyPath: 'id' });
          skStore.createIndex('chat_id', 'chat_id', { unique: false });
        }

        // 6. Signal Protocol Session Records (per device)
        if (!db.objectStoreNames.contains('signal_sessions')) {
          const sessionStore = db.createObjectStore('signal_sessions', { keyPath: 'key' });
          sessionStore.createIndex('userId', 'userId', { unique: false });
          sessionStore.createIndex('deviceId', 'deviceId', { unique: false });
        }

        // 7. Pre-keys for X3DH (per device)
        if (!db.objectStoreNames.contains('pre_keys')) {
          const pkStore = db.createObjectStore('pre_keys', { keyPath: 'id' });
          pkStore.createIndex('userId', 'userId', { unique: false });
          pkStore.createIndex('deviceId', 'deviceId', { unique: false });
        }

        // 8. Signed Pre-keys for X3DH (per device)
        if (!db.objectStoreNames.contains('signed_pre_keys')) {
          const spkStore = db.createObjectStore('signed_pre_keys', { keyPath: 'id' });
          spkStore.createIndex('userId', 'userId', { unique: false });
          spkStore.createIndex('deviceId', 'deviceId', { unique: false });
        }

        // 9. Trusted Identities (for trust-on-first-use, per device)
        if (!db.objectStoreNames.contains('trusted_identities')) {
          const tiStore = db.createObjectStore('trusted_identities', { keyPath: 'id' });
          tiStore.createIndex('userId', 'userId', { unique: false });
          tiStore.createIndex('deviceId', 'deviceId', { unique: false });
        }

        // 10. Device info (per user)
        if (!db.objectStoreNames.contains('devices')) {
          const devStore = db.createObjectStore('devices', { keyPath: 'id' });
          devStore.createIndex('userId', 'userId', { unique: false });
          devStore.createIndex('deviceId', 'deviceId', { unique: false });
        }

        // 11. History Transfer State
        if (!db.objectStoreNames.contains('history_transfers')) {
          const htStore = db.createObjectStore('history_transfers', { keyPath: 'transferId' });
          htStore.createIndex('userId', 'userId', { unique: false });
          htStore.createIndex('status', 'status', { unique: false });
        }

        // Migration from v4 to v5: add deviceId indexes
        if (oldVersion < 5) {
          // For existing stores, we can't add indexes easily in indexedDB
          // The app will need to clear data or handle migration
          // For now, we rely on the new key format including deviceId
        }

        // Migration from v5 to v6: add history_transfers store
        if (oldVersion < 6) {
          // history_transfers store created above
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return this.dbPromise;
  }

  // --- Message Persistence ---
  async saveMessageLocally(message: Message): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      store.put(message);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async acknowledgeMessage(tempId: string, id: string, status: Message['status'], createdAt: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const request = store.get(tempId);
      request.onsuccess = () => {
        if (request.result) {
          store.put({ ...request.result, id, status, created_at: createdAt, isSending: false });
          store.delete(tempId);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async saveMessagesLocally(messages: Message[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      messages.forEach((m) => store.put(m));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getLocalMessages(chatId: string): Promise<Message[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('chat_id');
      const req = index.getAll(chatId);

      req.onsuccess = () => {
        const msgs: Message[] = req.result || [];
        msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        resolve(msgs);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Remove every locally cached message for a chat.
   * Used by "clear history", which only affects the requesting member's view.
   */
  async clearMessagesForChat(chatId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      const store = tx.objectStore('messages');
      const index = store.index('chat_id');
      const req = index.openCursor(IDBKeyRange.only(chatId));

      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Store-and-Forward Outbox Queue ---
  async enqueueOutbox(item: {
    id: string; // temp_id
    chat_id: string;
    content: string;
    type?: string;
    reply_to_id?: string;
    media_url?: string;
    media_metadata?: any;
    created_at: string;
    ciphertext_payload?: string;
    is_plaintext?: boolean;
  }): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getOutbox(): Promise<any[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly');
      const store = tx.objectStore('outbox');
      const req = store.getAll();
      req.onsuccess = () => {
        const items = req.result || [];
        items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async removeFromOutbox(tempId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      store.delete(tempId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Mesh Packet Deduplication Cache ---
  async hasMeshPacket(packetId: string): Promise<boolean> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('mesh_packets', 'readonly');
      const store = tx.objectStore('mesh_packets');
      const req = store.get(packetId);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async cacheMeshPacket(packet: MeshPacket): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('mesh_packets', 'readwrite');
      const store = tx.objectStore('mesh_packets');
      store.put(packet);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Identity Key Storage ---
  async saveIdentityKey(id: string, data: any): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('identity_keys', 'readwrite');
      const store = tx.objectStore('identity_keys');
      store.put({ id, ...data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getIdentityKey(id: string): Promise<any> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('identity_keys', 'readonly');
      const store = tx.objectStore('identity_keys');
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Group Sender Key Ratchet State ---
  /**
   * Persist one ratchet record.
   *
   * Two shapes share this store, keyed by `id`:
   *   - `"<chatId>::self"`   — the chain this device sends with, plus the members
   *                            it has distributed to (used to spot a membership change)
   *   - `"<chatId>:<senderId>"` — a peer's chain, plus message keys skipped by
   *                            out-of-order arrival
   */
  async saveSenderKeyState<T extends { id: string; chat_id: string }>(record: T): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sender_keys', 'readwrite');
      tx.objectStore('sender_keys').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSenderKeyState<T = any>(id: string): Promise<T | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sender_keys', 'readonly');
      const req = tx.objectStore('sender_keys').get(id);
      req.onsuccess = () => resolve((req.result as T) || null);
      req.onerror = () => reject(req.error);
    });
  }

  async listSenderKeyStatesForChat<T = any>(chatId: string): Promise<T[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sender_keys', 'readonly');
      const req = tx.objectStore('sender_keys').index('chat_id').getAll(chatId);
      req.onsuccess = () => resolve((req.result as T[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Session & Cache Invalidation ---
  /**
   * Wipe cached conversation data on logout / account switch.
   *
   * Deliberately does NOT clear `identity_keys`, `sender_keys`, or `trusted_identities`.
   * The E2EE identity key is the account's long-term keypair per device, so deleting
   * it on logout means the next sign-in mints a *different* keypair — every message
   * previously encrypted to the old key becomes permanently unreadable, and peers
   * see the published key change (which is indistinguishable from a key-substitution
   * attack).
   *
   * Keeping it leaks nothing: records are keyed by user id and device id and only
   * ever read for the signed-in user, so a second account on the same browser reads
   * its own key. The in-memory key material is what must not survive a session
   * change, and `CryptoService.reset()` handles that.
   */
  async clearUserData(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['messages', 'outbox', 'mesh_packets', 'signal_sessions', 'pre_keys', 'signed_pre_keys'], 'readwrite');
      tx.objectStore('messages').clear();
      tx.objectStore('outbox').clear();
      tx.objectStore('mesh_packets').clear();
      tx.objectStore('signal_sessions').clear();
      tx.objectStore('pre_keys').clear();
      tx.objectStore('signed_pre_keys').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Clear all data for a specific device (used when revoking a device).
   * This removes all device-specific key material, sessions, and trust data.
   * Does NOT clear messages or outbox (those are per-user, not per-device).
   */
  async clearDeviceData(deviceId: number): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['identity_keys', 'signal_sessions', 'pre_keys', 'signed_pre_keys', 'trusted_identities', 'devices'], 'readwrite');
      
      // Clear identity keys for this device
      const idStore = tx.objectStore('identity_keys');
      const idIndex = idStore.index('deviceId');
      const idReq = idIndex.openCursor(IDBKeyRange.only(deviceId));
      idReq.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };

      // Clear sessions for this device
      const sessStore = tx.objectStore('signal_sessions');
      const sessIndex = sessStore.index('deviceId');
      const sessReq = sessIndex.openCursor(IDBKeyRange.only(deviceId));
      sessReq.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };

      // Clear pre-keys for this device
      const pkStore = tx.objectStore('pre_keys');
      const pkIndex = pkStore.index('deviceId');
      const pkReq = pkIndex.openCursor(IDBKeyRange.only(deviceId));
      pkReq.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };

      // Clear signed pre-keys for this device
      const spkStore = tx.objectStore('signed_pre_keys');
      const spkIndex = spkStore.index('deviceId');
      const spkReq = spkIndex.openCursor(IDBKeyRange.only(deviceId));
      spkReq.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };

      // Clear trusted identities for this device
      const tiStore = tx.objectStore('trusted_identities');
      const tiIndex = tiStore.index('deviceId');
      const tiReq = tiIndex.openCursor(IDBKeyRange.only(deviceId));
      tiReq.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };

      // Clear device info
      const devStore = tx.objectStore('devices');
      const devIndex = devStore.index('deviceId');
      const devReq = devIndex.openCursor(IDBKeyRange.only(deviceId));
      devReq.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- History Transfer State ---
  async saveHistoryTransfer(transfer: {
    transferId: string;
    userId: string;
    role: 'source' | 'dest';
    status: 'pending' | 'approved' | 'active' | 'completed' | 'failed' | 'cancelled' | 'expired';
    partnerUserId: string;
    partnerDeviceId: number;
    myDeviceId: number;
    challenge?: number[];
    challengeSignature?: number[];
    sourceEphemeralPubKey?: number[];
    sourceEphemeralPrivKey?: number[];
    destEphemeralPubKey?: number[];
    destEphemeralPrivKey?: number[];
    transferKey?: number[];
    policy: { include_groups: boolean; include_direct: boolean; date_range: { start?: string; end?: string } | null };
    totalBatches: number;
    currentBatch: number;
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('history_transfers', 'readwrite');
      const store = tx.objectStore('history_transfers');
      store.put({
        ...transfer,
        challenge: transfer.challenge ? Array.from(transfer.challenge) : undefined,
        challengeSignature: transfer.challengeSignature ? Array.from(transfer.challengeSignature) : undefined,
        sourceEphemeralPubKey: transfer.sourceEphemeralPubKey ? Array.from(transfer.sourceEphemeralPubKey) : undefined,
        sourceEphemeralPrivKey: transfer.sourceEphemeralPrivKey ? Array.from(transfer.sourceEphemeralPrivKey) : undefined,
        destEphemeralPubKey: transfer.destEphemeralPubKey ? Array.from(transfer.destEphemeralPubKey) : undefined,
        destEphemeralPrivKey: transfer.destEphemeralPrivKey ? Array.from(transfer.destEphemeralPrivKey) : undefined,
        transferKey: transfer.transferKey ? Array.from(transfer.transferKey) : undefined,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getHistoryTransfer(transferId: string): Promise<any | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('history_transfers', 'readonly');
      const store = tx.objectStore('history_transfers');
      const req = store.get(transferId);
      req.onsuccess = () => {
        const result = req.result;
        if (!result) return resolve(null);
        // Convert arrays back to Buffers
        resolve({
          ...result,
          challenge: result.challenge ? Buffer.from(result.challenge) : undefined,
          challengeSignature: result.challengeSignature ? Buffer.from(result.challengeSignature) : undefined,
          sourceEphemeralPubKey: result.sourceEphemeralPubKey ? Buffer.from(result.sourceEphemeralPubKey) : undefined,
          destEphemeralPubKey: result.destEphemeralPubKey ? Buffer.from(result.destEphemeralPubKey) : undefined,
          transferKey: result.transferKey ? Buffer.from(result.transferKey) : undefined,
        });
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getHistoryTransfersByUser(userId: string): Promise<Array<any>> {
    const db = await this.getDB();
    return new Promise<Array<any>>((resolve, reject) => {
      const tx = db.transaction('history_transfers', 'readonly');
      const store = tx.objectStore('history_transfers');
      const index = store.index('userId');
      const req = index.getAll(userId);
      req.onsuccess = () => {
        const results = req.result || [];
        const mapped = results.map((r: any) => {
          const result: any = { ...r };
          if (r.challenge) result.challenge = Buffer.from(r.challenge);
          if (r.challengeSignature) result.challengeSignature = Buffer.from(r.challengeSignature);
          if (r.sourceEphemeralPubKey) result.sourceEphemeralPubKey = Buffer.from(r.sourceEphemeralPubKey);
          if (r.destEphemeralPubKey) result.destEphemeralPubKey = Buffer.from(r.destEphemeralPubKey);
          if (r.transferKey) result.transferKey = Buffer.from(r.transferKey);
          return result;
        });
        resolve(mapped);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getHistoryTransfersByStatus(userId: string, status: string): Promise<Array<any>> {
    const db = await this.getDB();
    return new Promise<Array<any>>((resolve, reject) => {
      const tx = db.transaction('history_transfers', 'readonly');
      const store = tx.objectStore('history_transfers');
      const index = store.index('status');
      const req = index.getAll(status);
      req.onsuccess = () => {
        const results = req.result || [];
        const userResults = results.filter(r => r.userId === userId);
        const mapped = userResults.map((r: any) => {
          const result: any = { ...r };
          if (r.challenge) result.challenge = Buffer.from(r.challenge);
          if (r.challengeSignature) result.challengeSignature = Buffer.from(r.challengeSignature);
          if (r.sourceEphemeralPubKey) result.sourceEphemeralPubKey = Buffer.from(r.sourceEphemeralPubKey);
          if (r.destEphemeralPubKey) result.destEphemeralPubKey = Buffer.from(r.destEphemeralPubKey);
          if (r.transferKey) result.transferKey = Buffer.from(r.transferKey);
          return result;
        });
        resolve(mapped);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async deleteHistoryTransfer(transferId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('history_transfers', 'readwrite');
      const store = tx.objectStore('history_transfers');
      store.delete(transferId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Save a history transfer batch to staging area (for crash-safe import).
   * Uses the message_id as part of the key for idempotency.
   */
  async stageHistoryBatch(transferId: string, batchSeq: number, messages: any[]): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('history_transfer_batches', 'readwrite');
      const store = tx.objectStore('history_transfer_batches');
      
      // Use composite key: transferId + batchSeq for idempotency
      const key = `${transferId}:${batchSeq}`;
      store.put({ key, transferId, batchSeq, messages, status: 'staged', createdAt: new Date().toISOString() });
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Mark a history transfer batch as committed (successfully imported).
   */
  async commitHistoryBatch(transferId: string, batchSeq: number): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('history_transfer_batches', 'readwrite');
      const store = tx.objectStore('history_transfer_batches');
      
      const key = `${transferId}:${batchSeq}`;
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result;
        if (record) {
          record.status = 'committed';
          record.committedAt = new Date().toISOString();
          store.put(record);
        }
        resolve();
      };
      req.onerror = () => reject(req.error);
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Get staged (uncommitted) batches for a transfer.
   */
  async getStagedBatches(transferId: string): Promise<Array<{ batchSeq: number; messages: any[] }>> {
    const db = await this.getDB();
    return new Promise<Array<{ batchSeq: number; messages: any[] }>>((resolve, reject) => {
      const tx = db.transaction('history_transfer_batches', 'readonly');
      const store = tx.objectStore('history_transfer_batches');
      const index = store.index('transferId');
      const range = IDBKeyRange.only(transferId);
      const req = index.getAll(range);
      
      req.onsuccess = () => {
        const results = req.result || [];
        const staged = results
          .filter(r => r.status === 'staged')
          .map(r => ({ batchSeq: r.batchSeq, messages: r.messages }));
        resolve(staged);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get committed batch sequence numbers for a transfer.
   */
  async getCommittedBatches(transferId: string): Promise<number[]> {
    const db = await this.getDB();
    return new Promise<number[]>((resolve, reject) => {
      const tx = db.transaction('history_transfer_batches', 'readonly');
      const store = tx.objectStore('history_transfer_batches');
      const index = store.index('transferId');
      const range = IDBKeyRange.only(transferId);
      const req = index.getAll(range);
      
      req.onsuccess = () => {
        const results = req.result || [];
        const committed = results
          .filter(r => r.status === 'committed')
          .map(r => r.batchSeq)
          .sort((a, b) => a - b);
        resolve(committed);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Delete all staged batches for a transfer (cleanup on cancel/failure).
   */
  async clearStagedBatches(transferId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('history_transfer_batches', 'readwrite');
      const store = tx.objectStore('history_transfer_batches');
      const index = store.index('transferId');
      const range = IDBKeyRange.only(transferId);
      const req = index.openCursor(range);
      
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Get the transfer state for recovery purposes.
   */
  async getTransferState(transferId: string): Promise<{
    transferId: string;
    status: string;
    stagedBatches: number;
    committedBatches: number[];
    totalBatches: number;
  } | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('history_transfer_batches', 'readonly');
      const store = tx.objectStore('history_transfer_batches');
      const index = store.index('transferId');
      const range = IDBKeyRange.only(transferId);
      const req = index.getAll(IDBKeyRange.only(transferId));
      
      req.onsuccess = () => {
        const results = req.result || [];
        if (results.length === 0) {
          resolve(null);
          return;
        }
        
        const staged = results.filter(r => r.status === 'staged').length;
        const committed = results.filter(r => r.status === 'committed').map(r => r.batchSeq).sort((a, b) => a - b);
        const total = results.length;
        
        resolve({
          transferId,
          status: results[0]?.status || 'unknown',
          stagedBatches: staged,
          committedBatches: committed,
          totalBatches: total,
        });
      };
      req.onerror = () => reject(req.error);
    });
  }
}
export const offlineStorage = new OfflineStorageService();
