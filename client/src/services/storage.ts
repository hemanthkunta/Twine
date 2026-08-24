import { Message, MeshPacket } from '../types/index';

const DB_NAME = 'aerogram_offline_db';
const DB_VERSION = 1;

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
}

export const offlineStorage = new OfflineStorageService();
