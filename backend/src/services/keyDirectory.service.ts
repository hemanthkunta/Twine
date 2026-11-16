import { BaseService } from './base.service.js';
import crypto from 'node:crypto';
import { crypto as signalCrypto } from 'libsignal-protocol-typescript/lib/internal/index.js';

export interface PreKeyBundle {
    registrationId: number;
    deviceId: number;
    identityKey: string;
    signedPreKeyId: number;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    preKeyId: number;
    preKeyPublic: string;
    oneTimePreKeys: Array<{ id: number; publicKey: string }>;
}

export interface DeviceInfo {
    userId: string;
    deviceId: number;
    deviceName: string | null;
    publicKey: string;
    isRevoked: boolean;
    createdAt: string;
    lastSeenAt: string | null;
}

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
        // Compute cutoff in JS to avoid fragile SQL string concatenation.
        const cutoff = new Date(Date.now() - daysOld * 864e5)
            .toISOString()
            .replace('T', ' ')
            .slice(0, 19);
        const result = BaseService.execute(
            'DELETE FROM one_time_prekeys WHERE created_at < ?',
            [cutoff]
        );
        return result.changes;
    }

    /**
     * Verify a signed pre-key signature using the identity key.
     * Uses Ed25519 verification as libsignal-protocol-typescript uses Ed25519 for signed pre-keys.
     * The identity key from libsignal is 33 bytes (version byte 5 + 32 bytes raw Ed25519 public key).
     */
    static async verifySignedPreKey(identityKey: string, signedPreKeyPublic: string, signature: string): Promise<boolean> {
        try {
            const bytes = (value: string) => Uint8Array.from(Buffer.from(value, 'base64')).buffer;
            await signalCrypto.Ed25519Verify(bytes(identityKey), bytes(signedPreKeyPublic), bytes(signature));
            return true; // libsignal throws on failure and returns false on success.
        } catch { return false; }
    }

    /**
     * Store a pre-key bundle for a user and device (X3DH).
     */
    static storePreKeyBundle(userId: string, bundle: PreKeyBundle): void {
        BaseService.execute(
            `
            INSERT INTO pre_key_bundles
            (user_id, device_id, registration_id, identity_key, signed_pre_key_id, signed_pre_key_public, signed_pre_key_signature, pre_key_id, pre_key_public, one_time_pre_keys, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(user_id, device_id) DO UPDATE SET
                registration_id = excluded.registration_id,
                identity_key = excluded.identity_key,
                signed_pre_key_id = excluded.signed_pre_key_id,
                signed_pre_key_public = excluded.signed_pre_key_public,
                signed_pre_key_signature = excluded.signed_pre_key_signature,
                pre_key_id = excluded.pre_key_id,
                pre_key_public = excluded.pre_key_public,
                one_time_pre_keys = excluded.one_time_pre_keys,
                updated_at = datetime('now')
            `,
            [
                userId,
                bundle.deviceId,
                bundle.registrationId,
                bundle.identityKey,
                bundle.signedPreKeyId,
                bundle.signedPreKeyPublic,
                bundle.signedPreKeySignature,
                bundle.preKeyId,
                bundle.preKeyPublic,
                JSON.stringify(bundle.oneTimePreKeys)
            ]
        );
    }

    /**
     * Get a pre-key bundle for a user and device (X3DH).
     * Returns null if device is revoked or doesn't exist.
     */
    static getPreKeyBundle(userId: string, deviceId?: number): PreKeyBundle | null {
        // If no deviceId specified, get the first non-revoked device
        let whereClause = 'WHERE user_id = ?';
        const params: (string | number)[] = [userId];
        if (deviceId !== undefined) {
            whereClause += ' AND device_id = ? AND device_id IN (SELECT device_id FROM devices WHERE user_id = ? AND is_revoked = 0)';
            params.push(deviceId, userId);
        } else {
            // Get the first non-revoked device
            whereClause += ' AND device_id IN (SELECT device_id FROM devices WHERE user_id = ? AND is_revoked = 0 ORDER BY created_at LIMIT 1)';
            params.push(userId);
        }

        const row = BaseService.queryOne<{
            registration_id: number;
            device_id: number;
            identity_key: string;
            signed_pre_key_id: number;
            signed_pre_key_public: string;
            signed_pre_key_signature: string;
            pre_key_id: number;
            pre_key_public: string;
            one_time_pre_keys: string;
        }>(
            `SELECT registration_id, device_id, identity_key, signed_pre_key_id, signed_pre_key_public, signed_pre_key_signature, pre_key_id, pre_key_public, one_time_pre_keys FROM pre_key_bundles ${whereClause}`,
            params
        );

        if (!row) return null;

        return {
            registrationId: row.registration_id,
            deviceId: row.device_id,
            identityKey: row.identity_key,
            signedPreKeyId: row.signed_pre_key_id,
            signedPreKeyPublic: row.signed_pre_key_public,
            signedPreKeySignature: row.signed_pre_key_signature,
            preKeyId: row.pre_key_id,
            preKeyPublic: row.pre_key_public,
            oneTimePreKeys: JSON.parse(row.one_time_pre_keys || '[]')
        };
    }

    /**
     * Consume a one-time pre-key for a specific device (mark as used and return it).
     * Uses a transaction to ensure atomic consumption - prevents two clients
     * from successfully consuming the same key.
     */
    static consumeOneTimePreKey(userId: string, deviceId: number): { id: number; publicKey: string } | null {
        // Use a transaction to atomically select and delete the oldest one-time pre-key for the device
        const result = BaseService.transaction((conn) => {
            // First, get the pre_key_id from the device's bundle
            const bundle = conn.prepare(
                'SELECT pre_key_id FROM pre_key_bundles WHERE user_id = ? AND device_id = ?'
            ).get(userId, deviceId) as { pre_key_id: number } | undefined;

            if (!bundle) return null;

            const row = conn.prepare(
                'SELECT pre_key_id, public_key FROM one_time_prekeys WHERE user_id = ? AND pre_key_id >= ? ORDER BY pre_key_id ASC LIMIT 1'
            ).get(userId, bundle.pre_key_id) as { pre_key_id: number; public_key: string } | undefined;

            if (!row) return null;

            // Delete the consumed pre-key
            conn.prepare(
                'DELETE FROM one_time_prekeys WHERE user_id = ? AND pre_key_id = ?'
            ).run(userId, row.pre_key_id);

            return { id: row.pre_key_id, publicKey: row.public_key };
        });

        return result;
    }

    /**
     * Register a new device for a user.
     */
    static registerDevice(userId: string, deviceId: number, deviceName: string | null, publicKey: string): DeviceInfo {
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        BaseService.execute(
            `INSERT INTO devices (user_id, device_id, device_name, public_key, is_revoked, created_at, last_seen_at)
             VALUES (?, ?, ?, ?, 0, ?, ?)
             ON CONFLICT(user_id, device_id) DO UPDATE SET
                device_name = excluded.device_name,
                public_key = excluded.public_key,
                last_seen_at = excluded.last_seen_at`,
            [userId, deviceId, deviceName, publicKey, now, now]
        );

        const device = this.getDevice(userId, deviceId);
        if (!device) {
            throw new Error('Failed to register device');
        }
        return device;
    }

    /**
     * Get a specific device for a user.
     */
    static getDevice(userId: string, deviceId: number): DeviceInfo | null {
        const row = BaseService.queryOne<{
            user_id: string;
            device_id: number;
            device_name: string | null;
            public_key: string;
            is_revoked: number;
            created_at: string;
            last_seen_at: string | null;
        }>(
            'SELECT user_id, device_id, device_name, public_key, is_revoked, created_at, last_seen_at FROM devices WHERE user_id = ? AND device_id = ?',
            [userId, deviceId]
        );

        if (!row) return null;

        return {
            userId: row.user_id,
            deviceId: row.device_id,
            deviceName: row.device_name,
            publicKey: row.public_key,
            isRevoked: row.is_revoked === 1,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at,
        };
    }

    /**
     * List all devices for a user.
     */
    static listDevices(userId: string): DeviceInfo[] {
        const rows = BaseService.query<{
            user_id: string;
            device_id: number;
            device_name: string | null;
            public_key: string;
            is_revoked: number;
            created_at: string;
            last_seen_at: string | null;
        }>(
            'SELECT user_id, device_id, device_name, public_key, is_revoked, created_at, last_seen_at FROM devices WHERE user_id = ? ORDER BY device_id',
            [userId]
        );

        return rows.map(row => ({
            userId: row.user_id,
            deviceId: row.device_id,
            deviceName: row.device_name,
            publicKey: row.public_key,
            isRevoked: row.is_revoked === 1,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at,
        }));
    }

    /**
     * Revoke a device for a user.
     * This marks the device as revoked and removes its pre-key bundle.
     * Uses a transaction to ensure atomicity.
     */
    static revokeDevice(userId: string, deviceId: number): boolean {
        // Use a transaction to ensure atomicity
        const result = BaseService.transaction((conn) => {
            // Mark device as revoked
            const result = conn.prepare(
                'UPDATE devices SET is_revoked = 1 WHERE user_id = ? AND device_id = ?'
            ).run(userId, deviceId);

            // Remove the device's pre-key bundle
            conn.prepare(
                'DELETE FROM pre_key_bundles WHERE user_id = ? AND device_id = ?'
            ).run(userId, deviceId);

            // Remove the device's one-time prekeys
            conn.prepare(
                'DELETE FROM one_time_prekeys WHERE user_id = ? AND pre_key_id IN (SELECT pre_key_id FROM pre_key_bundles WHERE user_id = ? AND device_id = ?)'
            ).run(userId, userId, deviceId);

            // Remove the device's signed prekeys
            conn.prepare(
                'DELETE FROM signed_prekeys WHERE user_id = ? AND pre_key_id IN (SELECT signed_pre_key_id FROM pre_key_bundles WHERE user_id = ? AND device_id = ?)'
            ).run(userId, userId, deviceId);

            // Remove the device's identity key
            conn.prepare(
                'DELETE FROM identity_keys WHERE user_id = ? AND user_id IN (SELECT user_id FROM devices WHERE user_id = ? AND device_id = ?)'
            ).run(userId, userId, deviceId);

            return result.changes > 0;
        });

        return result;
    }

    /**
     * Update device last seen timestamp.
     */
    static updateDeviceLastSeen(userId: string, deviceId: number): void {
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        BaseService.execute(
            'UPDATE devices SET last_seen_at = ? WHERE user_id = ? AND device_id = ?',
            [now, userId, deviceId]
        );
    }

    /**
     * Check if a device is revoked.
     * An unregistered device is unknown rather than revoked.
     */
    static isDeviceRevoked(userId: string, deviceId: number): boolean {
        const device = this.getDevice(userId, deviceId);
        return device?.isRevoked ?? false;
    }
}
