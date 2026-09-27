import { db } from '../db/index.js';
import { BaseService } from './base.service.js';
import crypto from 'crypto';

export class BlockService {
    static blockUser(userId: string, targetUserId: string): boolean {
        if (!userId || !targetUserId || userId === targetUserId) return false;
        const id = `blk_${crypto.randomBytes(8).toString('hex')}`;
        BaseService.execute(
            `
                INSERT OR IGNORE INTO blocked_users (id, user_id, blocked_user_id, created_at)
                VALUES (?, ?, ?, datetime('now'))
            `,
            [id, userId, targetUserId]
        );
        return true;
    }

    static unblockUser(userId: string, targetUserId: string): boolean {
        if (!userId || !targetUserId) return false;
        const result = BaseService.execute(
            `
                DELETE FROM blocked_users
                WHERE user_id = ? AND blocked_user_id = ?
            `,
            [userId, targetUserId]
        );
        return result.changes > 0;
    }

    static isBlocked(userId: string, targetUserId: string): boolean {
        if (!userId || !targetUserId) return false;
        const row = BaseService.queryOne<{ 1: number }>(
            `
                SELECT 1 FROM blocked_users
                WHERE (user_id = ? AND blocked_user_id = ?)
                   OR (user_id = ? AND blocked_user_id = ?)
                LIMIT 1
            `,
            [userId, targetUserId, targetUserId, userId]
        );
        return Boolean(row);
    }

    static isBlockedBy(senderId: string, recipientId: string): boolean {
        if (!senderId || !recipientId) return false;
        const row = BaseService.queryOne<{ 1: number }>(
            `
                SELECT 1 FROM blocked_users
                WHERE user_id = ? AND blocked_user_id = ?
                LIMIT 1
            `,
            [recipientId, senderId]
        );
        return Boolean(row);
    }

    static getBlockedUserIds(userId: string): string[] {
        if (!userId) return [];
        const rows = BaseService.query<{ blocked_user_id: string }>(
            `
                SELECT blocked_user_id FROM blocked_users
                WHERE user_id = ?
            `,
            [userId]
        );
        return rows.map((r) => r.blocked_user_id);
    }
}