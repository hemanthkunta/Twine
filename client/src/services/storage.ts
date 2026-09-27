import { Message, MeshPacket } from '../types/index';

const DB_NAME = 'aerogram_offline_db';
// v2 adds the `sender_keys` store for group E2EE ratchet state. `onupgradeneeded`
// creates stores by name-guard, so an existing v1 database upgrades in place and
// keeps its cached messages.
const DB_VERSION = 2;

class OfflineStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event: any) => {
        const db = event.target.result as IDBDatabase;

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

        // 4. ECDH & Device Identity Keys Store
        if (!db.objectStoreNames.contains('identity_keys')) {
          db.createObjectStore('identity_keys', { keyPath: 'id' });
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
   * Deliberately does NOT clear `identity_keys`. An earlier revision did, which
   * looked like the safe choice but was a data-loss bug: the E2EE identity key
   * is the account's long-term keypair, so deleting it on logout means the next
   * sign-in mints a *different* keypair — every message previously encrypted to
   * the old key becomes permanently unreadable, and peers see the published key
   * change (which is indistinguishable from a key-substitution attack).
   *
   * Keeping it leaks nothing: records are keyed by user id and only ever read for
   * the signed-in user, so a second account on the same browser reads its own key.
   * The in-memory key material is what must not survive a session change, and
   * `CryptoService.reset()` handles that.
   */
  async clearUserData(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['messages', 'outbox', 'mesh_packets'], 'readwrite');
      tx.objectStore('messages').clear();
      tx.objectStore('outbox').clear();
      tx.objectStore('mesh_packets').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const offlineStorage = new OfflineStorageService();
