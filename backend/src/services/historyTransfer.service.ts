import { BaseService } from './base.service.js';
import { KeyDirectoryService } from './keyDirectory.service.js';
import crypto from 'crypto';

export interface TransferPolicy {
    include_groups?: boolean;
    include_direct?: boolean;
    date_range?: { start?: string; end?: string } | null;
}

export interface TransferAuthRecord {
    transfer_id: string;
    source_user_id: string;
    source_device_id: number;
    dest_user_id: string;
    dest_device_id: number;
    challenge: Buffer;
    challenge_signature: Buffer | null;
    source_ephemeral_pubkey: Buffer;
    dest_ephemeral_pubkey: Buffer | null;
    policy: TransferPolicy;
    status: 'pending' | 'approved' | 'expired' | 'revoked' | 'cancelled';
    created_at: string;
    approved_at: string | null;
    expires_at: string;
    cancelled_at: string | null;
}

export interface TransferSessionRecord {
    transfer_id: string;
    session_enc_key: Buffer;
    session_auth_key: Buffer;
    total_batches: number;
    next_batch_seq: number;
    status: 'active' | 'completed' | 'failed' | 'expired';
    created_at: string;
    updated_at: string;
}

export interface TransferBatchRecord {
    id: number;
    transfer_id: string;
    batch_seq: number;
    message_count: number;
    byte_size: number;
    status: 'pending' | 'acknowledged' | 'failed';
    sent_at: string | null;
    acked_at: string | null;
}

/**
 * History Transfer Service
 * 
 * Handles the server-side coordination of device-to-device message history transfer.
 * The server coordinates authorization and relays encrypted batches, but never
 * has access to plaintext messages or session keys.
 */
export class HistoryTransferService {
    /**
     * Create a new transfer authorization request.
     * Called by source device to initiate transfer to a destination device.
     */
    static async initiateTransfer(
        sourceUserId: string,
        sourceDeviceId: number,
        destUserId: string,
        destDeviceId: number,
        policy: TransferPolicy = { include_groups: true, include_direct: true, date_range: null }
    ): Promise<{
        transferId: string;
        challenge: Buffer;
        sourceEphemeralPubKey: Buffer;
        expiresAt: string;
    }> {
        // Validate source device
        const sourceDevice = KeyDirectoryService.getDevice(sourceUserId, sourceDeviceId);
        if (!sourceDevice || sourceDevice.isRevoked) {
            throw new Error('Source device not found or revoked');
        }

        // Validate destination device
        const destDevice = KeyDirectoryService.getDevice(destUserId, destDeviceId);
        if (!destDevice || destDevice.isRevoked) {
            throw new Error('Destination device not found or revoked');
        }

        // Prevent self-transfer
        if (sourceUserId === destUserId && sourceDeviceId === destDeviceId) {
            throw new Error('Cannot transfer to same device');
        }

        const transferId = crypto.randomUUID();
        const challenge = crypto.randomBytes(32);

        // Generate source ephemeral X25519 key pair
        const sourceEphemeralKeyPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'X25519' },
            true,
            ['deriveKey', 'deriveBits']
        );
        const sourceEphemeralPubKey = Buffer.from(
            await crypto.subtle.exportKey('raw', sourceEphemeralKeyPair.publicKey)
        );

        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);

        BaseService.execute(
            `INSERT INTO history_transfer_auth
             (transfer_id, source_user_id, source_device_id, dest_user_id, dest_device_id,
              challenge, source_ephemeral_pubkey, policy, status, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
            [transferId, sourceUserId, sourceDeviceId, destUserId, destDeviceId, challenge, sourceEphemeralPubKey, JSON.stringify(policy), expiresAt]
        );

        return { transferId, challenge, sourceEphemeralPubKey, expiresAt };
    }

    /**
     * Process destination device's authorization response.
     * Verifies signature and creates transfer session.
     */
    static async authorizeTransfer(
        destUserId: string,
        transferId: string,
        signatureB64: string,
        destEphemeralPubKeyB64?: string
    ): Promise<{ success: boolean }> {
        const authRecord = BaseService.queryOne(
            'SELECT * FROM history_transfer_auth WHERE transfer_id = ? AND dest_user_id = ?',
            [transferId, destUserId]
        ) as TransferAuthRecord | null;

        if (!authRecord) {
            throw new Error('Transfer not found or not authorized for this user');
        }

        if (authRecord.status !== 'pending') {
            throw new Error(`Transfer is not in pending state: ${authRecord.status}`);
        }

        // Check expiration
        const expiresAt = new Date(authRecord.expires_at.replace(' ', 'T') + 'Z');
        if (expiresAt < new Date()) {
            BaseService.execute('UPDATE history_transfer_auth SET status = ? WHERE transfer_id = ?', ['expired', transferId]);
            throw new Error('Transfer authorization has expired');
        }

        // Verify signature
        const challenge = authRecord.challenge;
        const signature = Buffer.from(signatureB64, 'base64');
        const destDevice = KeyDirectoryService.getDevice(destUserId, authRecord.dest_device_id);
        if (!destDevice) {
            throw new Error('Destination device not found');
        }

        const isValid = await KeyDirectoryService.verifySignedPreKey(
            destDevice.publicKey,
            challenge.toString('base64'),
            signature.toString('base64')
        );

        if (!isValid) {
            throw new Error('Invalid signature');
        }

        // Generate destination ephemeral key if not provided
        let destEphemeralPubKey: Buffer;
        if (destEphemeralPubKeyB64) {
            destEphemeralPubKey = Buffer.from(destEphemeralPubKeyB64, 'base64');
        } else {
            const destEphemeralKeyPair = await crypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: 'X25519' },
                true,
                ['deriveKey', 'deriveBits']
            );
            destEphemeralPubKey = Buffer.from(
                await crypto.subtle.exportKey('raw', destEphemeralKeyPair.publicKey)
            );
        }

        const approvedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
        BaseService.execute(
            `UPDATE history_transfer_auth
             SET status = 'approved', approved_at = ?, challenge_signature = ?, dest_ephemeral_pubkey = ?
             WHERE transfer_id = ?`,
            [approvedAt, Buffer.from(signatureB64, 'base64'), destEphemeralPubKey, transferId]
        );

        // Create transfer session with placeholder keys (actual keys derived client-side)
        const sessionEncKey = crypto.randomBytes(32);
        const sessionAuthKey = crypto.randomBytes(32);

        BaseService.execute(
            `INSERT INTO history_transfer_sessions (transfer_id, session_enc_key, session_auth_key, status)
             VALUES (?, ?, ?, 'active')`,
            [transferId, sessionEncKey, sessionAuthKey]
        );

        return { success: true };
    }

    /**
     * Get transfer status for a user (source or destination).
     */
    static getTransferStatus(userId: string, transferId: string): {
        transferId: string;
        status: string;
        isSource: boolean;
        isDest: boolean;
        createdAt: string;
        approvedAt: string | null;
        expiresAt: string;
        cancelledAt: string | null;
        session: { status: string; totalBatches: number } | null;
    } | null {
        const authRecord = BaseService.queryOne(
            'SELECT * FROM history_transfer_auth WHERE transfer_id = ? AND (source_user_id = ? OR dest_user_id = ?)',
            [transferId, userId, userId]
        ) as TransferAuthRecord | null;

        if (!authRecord) {
            return null;
        }

        const isSource = authRecord.source_user_id === userId;
        const isDest = authRecord.dest_user_id === userId;

        const sessionRecord = BaseService.queryOne(
            'SELECT * FROM history_transfer_sessions WHERE transfer_id = ?',
            [transferId]
        ) as TransferSessionRecord | null;

        return {
            transferId: authRecord.transfer_id,
            status: authRecord.status,
            isSource,
            isDest,
            createdAt: authRecord.created_at,
            approvedAt: authRecord.approved_at,
            expiresAt: authRecord.expires_at,
            cancelledAt: authRecord.cancelled_at,
            session: sessionRecord ? { status: sessionRecord.status, totalBatches: sessionRecord.total_batches } : null
        };
    }

    /**
     * List all active transfers for a user (as source or destination).
     */
    static listActiveTransfers(userId: string): Array<{
        transferId: string;
        role: 'source' | 'dest';
        status: string;
        partnerUserId: string;
        partnerDeviceId: number;
        createdAt: string;
        progress: { current: number; total: number };
    }> {
        const rows = BaseService.query<TransferAuthRecord>(
            `SELECT * FROM history_transfer_auth
             WHERE (source_user_id = ? OR dest_user_id = ?)
               AND status IN ('pending', 'approved')
             ORDER BY created_at DESC`,
            [userId, userId]
        );

        return rows.map((row) => {
            const isSource = row.source_user_id === userId;
            const session = BaseService.queryOne<TransferSessionRecord>(
                'SELECT * FROM history_transfer_sessions WHERE transfer_id = ?',
                [row.transfer_id]
            );
            return {
                transferId: row.transfer_id,
                role: isSource ? 'source' as const : 'dest' as const,
                status: row.status,
                partnerUserId: isSource ? row.dest_user_id : row.source_user_id,
                partnerDeviceId: isSource ? row.dest_device_id : row.source_device_id,
                createdAt: row.created_at,
                progress: {
                    current: session?.next_batch_seq ?? 0,
                    total: session?.total_batches ?? 0,
                },
            };
        });
    }

    /**
     * Cancel a transfer (by source or destination user).
     */
    static cancelTransfer(userId: string, transferId: string): void {
        const authRecord = BaseService.queryOne(
            'SELECT * FROM history_transfer_auth WHERE transfer_id = ? AND (source_user_id = ? OR dest_user_id = ?)',
            [transferId, userId, userId]
        );

        if (!authRecord) {
            throw new Error('Transfer not found');
        }

        const cancelledAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
        BaseService.execute(
            'UPDATE history_transfer_auth SET status = ?, cancelled_at = ? WHERE transfer_id = ?',
            ['cancelled', new Date().toISOString().replace('T', ' ').slice(0, 19), transferId]
        );

        BaseService.execute(
            'UPDATE history_transfer_sessions SET status = ? WHERE transfer_id = ?',
            ['failed', transferId]
        );
    }

    /**
     * Record a batch being sent.
     */
    static recordBatchSent(transferId: string, batchSeq: number, messageCount: number, byteSize: number): void {
        BaseService.execute(
            `INSERT INTO history_transfer_batches (transfer_id, batch_seq, message_count, byte_size, status, sent_at)
             VALUES (?, ?, ?, ?, 'pending', ?)
             ON CONFLICT(transfer_id, batch_seq) DO UPDATE SET
                message_count = excluded.message_count,
                byte_size = excluded.byte_size,
                status = 'pending',
                sent_at = excluded.sent_at`,
            [transferId, batchSeq, messageCount, byteSize, new Date().toISOString().replace('T', ' ').slice(0, 19)]
        );

        // Update session next_batch_seq
        BaseService.execute(
            'UPDATE history_transfer_sessions SET next_batch_seq = ?, updated_at = ? WHERE transfer_id = ?',
            [batchSeq + 1, new Date().toISOString().replace('T', ' ').slice(0, 19), transferId]
        );
    }

    /**
     * Record batch acknowledgment.
     */
    static recordBatchAck(transferId: string, batchSeq: number, success: boolean): void {
        const status = success ? 'acknowledged' : 'failed';
        const ackedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
        
        BaseService.execute(
            `UPDATE history_transfer_batches 
             SET status = ?, acked_at = ? 
             WHERE transfer_id = ? AND batch_seq = ?`,
            [status, ackedAt, transferId, batchSeq]
        );
    }

    /**
     * Complete the transfer.
     */
    static completeTransfer(transferId: string): void {
        BaseService.execute(
            `UPDATE history_transfer_sessions SET status = 'completed', updated_at = ? WHERE transfer_id = ?`,
            [new Date().toISOString().replace('T', ' ').slice(0, 19), transferId]
        );
    }

    /**
     * Check if a transfer is still valid (not expired, cancelled, or revoked).
     */
    static isTransferValid(transferId: string): boolean {
        const authRecord = BaseService.queryOne<{ status: string; expires_at: string }>(
            'SELECT status, expires_at FROM history_transfer_auth WHERE transfer_id = ?',
            [transferId]
        );

        if (!authRecord) return false;
        if (authRecord.status !== 'approved') return false;
        if (new Date(authRecord.expires_at.replace(' ', 'T') + 'Z') < new Date()) return false;
        return true;
    }

    /**
     * Clean up expired transfers (called periodically).
     */
    static cleanupExpiredTransfers(): number {
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const result = BaseService.execute(
            `UPDATE history_transfer_auth SET status = 'expired' WHERE status = 'pending' AND expires_at < ?`,
            [now]
        );
        return result.changes;
    }
}

export default HistoryTransferService;