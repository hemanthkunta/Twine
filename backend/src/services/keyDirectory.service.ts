import { BaseService } from './base.service.js';

export interface StoredIdentityKey {
    user_id: string;
    public_key: string;
    created_at: string;
    updated_at: string;
}

export interface StoredSignedPreKey {
    user_id: string;
    pre_key_id: number;
    public_key: string;
    signature: string;
    timestamp: string;
}

export interface StoredOneTimePreKey {
    user_id: string;
    pre_key_id: number;
    public_key: string;
    created_at: string;
}

/**
 * Public-key directory backing client-side E2EE (Signal Protocol).
 *
 * The server stores and hands out **public** keys only. Private keys are
 * generated and stored client-side, never transmitted to the server.
 *
 * Supported key types:
 * - Identity keys (long-term identity)
 * - Signed prekeys (medium-term, rotated periodically)
 * - One-time prekeys (single-use, for preventing replay attacks)
 *
 * Nothing here decrypts anything: message bodies arrive already sealed in
 * `messages.ciphertext_payload`. All encryption/decryption happens client-side.
 */
const MIN_KEY_LENGTH = 40;
const MAX_KEY_LENGTH = 512;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MIN_SIGNATURE_LENGTH = 64; // Approximately 512-bit signature base64
const MAX_SIGNATURE_LENGTH = 512;

export class KeyDirectoryService {
    /**
     * Basic shape check for a base64 SPKI public key.
     * This is not a cryptographic validation — the only thing that can really
     * verify a key is a peer doing ECDH with it.
     */
    static isValidPublicKey(publicKey: unknown): publicKey is string {
        if (typeof publicKey !== 'string') return false;
        if (publicKey.length < MIN_KEY_LENGTH || publicKey.length > MAX_KEY_LENGTH) return false;
        return BASE64_PATTERN.test(publicKey);
    }

    /**
     * Basic shape check for a base64 signature.
     */
    static isValidSignature(signature: unknown): signature is string {
        if (typeof signature !== 'string') return false;
        if (signature.length < MIN_SIGNATURE_LENGTH || signature.length > MAX_SIGNATURE_LENGTH) return false;
        return BASE64_PATTERN.test(signature);
    }

    /**
     * Publish (or rotate) the caller's identity public key.
     * Idempotent: republishing the same key is a no-op update.
     */
    static publish(userId: string, publicKey: string): StoredIdentityKey {
        BaseService.execute(
            `INSERT INTO identity_keys (user_id, public_key)
             VALUES (?, ?)
             ON CONFLICT(user_id) DO UPDATE SET
               public_key = excluded.public_key,
               updated_at = datetime('now')`,
            [userId, publicKey]
        );

        const stored = this.get(userId);
        if (!stored) {
            throw new Error('Failed to persist identity key');
        }
        return stored;
    }

    static get(userId: string): StoredIdentityKey | null {
        return BaseService.queryOne<StoredIdentityKey>(
            'SELECT user_id, public_key, created_at, updated_at FROM identity_keys WHERE user_id = ?',
            [userId]
        );
    }

    /**
     * Public keys are, by definition, public — so any authenticated user may read
     * any other's. Only the public half is returned.
     */
    static getPublicKey(userId: string): string | null {
        const row = this.get(userId);
        return row ? row.public_key : null;
    }

    /**
     * Publish a signed prekey for the user.
     * The server stores the public key and signature; the private key remains client-side.
     */
    static publishSignedPreKey(
        userId: string,
        preKeyId: number,
        publicKey: string,
        signature: string
    ): StoredSignedPreKey {
        // Validate inputs
        if (!this.isValidPublicKey(publicKey)) {
            throw new Error('Invalid signed prekey public key format');
        }
        if (!this.isValidSignature(signature)) {
            throw new Error('Invalid signature format');
        }

        BaseService.execute(
            `
            INSERT OR REPLACE INTO signed_prekeys
            (user_id, pre_key_id, public_key, signature, timestamp)
            VALUES (?, ?, ?, ?, datetime('now'))
            `,
            [userId, preKeyId, publicKey, signature]
        );

        const stored = this.getSignedPreKey(userId, preKeyId);
        if (!stored) {
            throw new Error('Failed to persist signed prekey');
        }
        return stored;
    }

    /**
     * Get a signed prekey by ID.
     */
    static getSignedPreKey(userId: string, preKeyId: number): StoredSignedPreKey | null {
        return BaseService.queryOne<StoredSignedPreKey>(
            'SELECT user_id, pre_key_id, public_key, signature, timestamp FROM signed_prekeys WHERE user_id = ? AND pre_key_id = ?',
            [userId, preKeyId]
        );
    }

    /**
     * Get all signed prekeys for a user (for cleanup/rotation).
     */
    static getSignedPreKeys(userId: string): StoredSignedPreKey[] {
        return BaseService.query<StoredSignedPreKey>(
            'SELECT user_id, pre_key_id, public_key, signature, timestamp FROM signed_prekeys WHERE user_id = ? ORDER BY pre_key_id',
            [userId]
        );
    }

    /**
     * Remove a signed prekey (after use or rotation).
     */
    static removeSignedPreKey(userId: string, preKeyId: number): boolean {
        const result = BaseService.execute(
            'DELETE FROM signed_prekeys WHERE user_id = ? AND pre_key_id = ?',
            [userId, preKeyId]
        );
        return result.changes > 0;
    }

    /**
     * Publish a one-time prekey for the user.
     * The server stores the public key; the private key remains client-side.
     * Returns true if this was a new prekey, false if it replaced an existing one.
     */
    static publishOneTimePreKey(
        userId: string,
        preKeyId: number,
        publicKey: string
    ): boolean {
        if (!this.isValidPublicKey(publicKey)) {
            throw new Error('Invalid one-time prekey public key format');
        }

        const existing = this.getOneTimePreKey(userId, preKeyId);
        const isNew = !existing;

        BaseService.execute(
            `
            INSERT OR REPLACE INTO one_time_prekeys
            (user_id, pre_key_id, public_key, created_at)
            VALUES (?, ?, ?, datetime('now'))
            `,
            [userId, preKeyId, publicKey]
        );

        return isNew;
    }

    /**
     * Get a one-time prekey by ID.
     */
    static getOneTimePreKey(userId: string, preKeyId: number): StoredOneTimePreKey | null {
        return BaseService.queryOne<StoredOneTimePreKey>(
            'SELECT user_id, pre_key_id, public_key, created_at FROM one_time_prekeys WHERE user_id = ? AND pre_key_id = ?',
            [userId, preKeyId]
        );
    }

    /**
     * Get all unused one-time prekeys for a user.
     */
    static getOneTimePreKeys(userId: string): StoredOneTimePreKey[] {
        return BaseService.query<StoredOneTimePreKey>(
            'SELECT user_id, pre_key_id, public_key, created_at FROM one_time_prekeys WHERE user_id = ? ORDER BY pre_key_id',
            [userId]
        );
    }

    /**
     * Remove a one-time prekey after it has been used.
     */
    static removeOneTimePreKey(userId: string, preKeyId: number): boolean {
        const result = BaseService.execute(
            'DELETE FROM one_time_prekeys WHERE user_id = ? AND pre_key_id = ?',
            [userId, preKeyId]
        );
        return result.changes > 0;
    }

    /**
     * Clean up old one-time prekeys (call periodically).
     * Removes one-time prekeys older than the specified days.
     */
    static cleanupOldOneTimePreKeys(daysOld: number = 7): number {
        const result = BaseService.execute(
            'DELETE FROM one_time_prekeys WHERE created_at < datetime(\'now\', ? || \' days\')',
            [-daysOld]
        );
        return result.changes;
    }
}
