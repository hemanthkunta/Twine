import { db } from '../db/index.js';
import crypto from 'crypto';

export class BlockService {
    static blockUser(userId: string, targetUserId: string): boolean {
        if (!userId || !targetUserId || userId === targetUserId) return false;
        const id = `blk_${crypto.randomBytes(8).toString('hex')}`;
        try {
            const stmt = db.prepare(`
                INSERT OR IGNORE INTO blocked_users (id, user_id, blocked_user_id, created_at)
                VALUES (?, ?, ?, datetime('now'))
            `);
            stmt.run(id, userId, targetUserId);
            return true;
        } catch (err) {
            console.error('Error blocking user:', err);
            return false;
        }
    }

    static unblockUser(userId: string, targetUserId: string): boolean {
        if (!userId || !targetUserId) return false;
        try {
            const stmt = db.prepare(`
                DELETE FROM blocked_users
                WHERE user_id = ? AND blocked_user_id = ?
            `);
            const res = stmt.run(userId, targetUserId);
            return res.changes > 0;
        } catch (err) {
            console.error('Error unblocking user:', err);
            return false;
        }
    }

    static isBlocked(userId: string, targetUserId: string): boolean {
        if (!userId || !targetUserId) return false;
        try {
            const stmt = db.prepare(`
                SELECT 1 FROM blocked_users
                WHERE (user_id = ? AND blocked_user_id = ?)
                   OR (user_id = ? AND blocked_user_id = ?)
                LIMIT 1
            `);
            const row = stmt.get(userId, targetUserId, targetUserId, userId);
            return Boolean(row);
        } catch {
            return false;
        }
    }

    static isBlockedBy(senderId: string, recipientId: string): boolean {
        if (!senderId || !recipientId) return false;
        try {
            const stmt = db.prepare(`
                SELECT 1 FROM blocked_users
                WHERE user_id = ? AND blocked_user_id = ?
                LIMIT 1
            `);
            return Boolean(stmt.get(recipientId, senderId));
        } catch {
            return false;
        }
    }

    static getBlockedUserIds(userId: string): string[] {
        if (!userId) return [];
        try {
            const stmt = db.prepare(`
                SELECT blocked_user_id FROM blocked_users
                WHERE user_id = ?
            `);
            const rows = stmt.all(userId) as { blocked_user_id: string }[];
            return rows.map((r) => r.blocked_user_id);
        } catch {
            return [];
        }
    }
}
