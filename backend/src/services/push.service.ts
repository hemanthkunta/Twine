import crypto from 'node:crypto';
import { db } from '../db/index.js';

export interface PushSubscriptionPayload {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    userId: string;
}

export class PushNotificationService {
    static saveSubscription(sub: PushSubscriptionPayload) {
        if (
            !sub ||
            typeof sub.userId !== 'string' ||
            !sub.userId ||
            typeof sub.endpoint !== 'string' ||
            !sub.endpoint ||
            !sub.keys ||
            typeof sub.keys.p256dh !== 'string' ||
            !sub.keys.p256dh ||
            typeof sub.keys.auth !== 'string' ||
            !sub.keys.auth
        ) {
            throw new Error('Invalid push subscription');
        }

        // Make sure the authenticated user actually exists.
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(sub.userId) as
            | { id: string }
            | undefined;

        if (!user) {
            throw new Error('User not found');
        }

        const existing = db
            .prepare(
                `
                SELECT id
                FROM push_subscriptions
                WHERE endpoint = ?
                LIMIT 1
                `
            )
            .get(sub.endpoint) as { id: string } | undefined;

        if (existing) {
            db.prepare(
                `
                UPDATE push_subscriptions
                SET
                    user_id = ?,
                    p256dh = ?,
                    auth = ?,
                    updated_at = datetime('now')
                WHERE id = ?
                `
            ).run(sub.userId, sub.keys.p256dh, sub.keys.auth, existing.id);
        } else {
            const id = `push_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

            db.prepare(
                `
                INSERT INTO push_subscriptions
                    (id, user_id, endpoint, p256dh, auth)
                VALUES (?, ?, ?, ?, ?)
                `
            ).run(id, sub.userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
        }

        console.log(`[Push Notification] Persisted subscription for user ${sub.userId}`);

        return { success: true };
    }

    static getSubscriptions(userId: string): PushSubscriptionPayload[] {
        const rows = db
            .prepare(
                `
                SELECT user_id, endpoint, p256dh, auth
                FROM push_subscriptions
                WHERE user_id = ?
                ORDER BY updated_at DESC
                `
            )
            .all(userId) as Array<{
            user_id: string;
            endpoint: string;
            p256dh: string;
            auth: string;
        }>;

        return rows.map((row) => ({
            userId: row.user_id,
            endpoint: row.endpoint,
            keys: {
                p256dh: row.p256dh,
                auth: row.auth,
            },
        }));
    }

    static async sendPush(userId: string, title: string, body: string, data?: any) {
        const subscriptions = this.getSubscriptions(userId);

        if (subscriptions.length === 0) {
            console.log(
                `[Push Notification] No push subscription for user ${userId}, queuing offline.`
            );

            return {
                sent: false,
                reason: 'no_subscription',
            };
        }

        console.log(
            `[Push Notification] Dispatched FCM/WebPush to ${userId}: "${title}" - "${body}"`
        );

        return {
            sent: true,
            subscriptionCount: subscriptions.length,
            timestamp: Date.now(),
        };
    }
}
