import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { getLogger } from './logger.service.js';
import webPush from 'web-push';
import { PresenceService } from './presence.service.js';

const logger = getLogger();

export interface PushSubscriptionPayload {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
    userId: string;
}

export class PushNotificationService {
    static getPublicKey(): string | null {
        return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
            ? process.env.VAPID_PUBLIC_KEY : null;
    }

    static removeSubscription(userId: string, endpoint: string) {
        db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
    }

    static async notifyOfflineMessage(chatId: string, senderId: string, messageId: string) {
        try {
            const members = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? AND is_muted = 0')
                .all(chatId, senderId) as { user_id: string }[];
            await Promise.all(members.filter(m => !PresenceService.isUserOnline(m.user_id)).map(m =>
                this.sendPush(m.user_id, 'Twine', 'You have a new message', { chatId, messageId })
            ));
        } catch (error) {
            logger.error({ error }, 'Offline push dispatch failed');
        }
    }

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
        const endpoint = new URL(sub.endpoint);
        const trustedHost = endpoint.hostname === 'fcm.googleapis.com' ||
            endpoint.hostname === 'updates.push.services.mozilla.com' ||
            endpoint.hostname.endsWith('.push.apple.com') ||
            endpoint.hostname.endsWith('.notify.windows.com');
        if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || !trustedHost ||
            Buffer.from(sub.keys.p256dh, 'base64url').length !== 65 ||
            Buffer.from(sub.keys.auth, 'base64url').length !== 16) {
            throw new Error('Invalid push subscription endpoint or keys');
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

        logger.info(`[Push Notification] Persisted subscription for user ${sub.userId}`);

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

    static async sendPush(userId: string, title: string, body: string, data?: unknown) {
        const subscriptions = this.getSubscriptions(userId);

        if (subscriptions.length === 0) {
            logger.info(
                `[Push Notification] No push subscription for user ${userId}; message remains in chat history.`
            );

            return {
                sent: false,
                reason: 'no_subscription',
            };
        }

        const publicKey = this.getPublicKey();
        if (!publicKey) return { sent: false, reason: 'provider_not_configured' };
        const results = await Promise.all(subscriptions.map(async (sub) => {
            try {
                await webPush.sendNotification(sub, JSON.stringify({ title, body, data }), {
                    vapidDetails: { subject: process.env.VAPID_SUBJECT!, publicKey, privateKey: process.env.VAPID_PRIVATE_KEY! },
                    TTL: 3600, timeout: 10000,
                });
                return true;
            } catch (error: any) {
                if (error.statusCode === 404 || error.statusCode === 410) this.removeSubscription(userId, sub.endpoint);
                logger.warn({ statusCode: error.statusCode }, 'Push provider rejected delivery');
                return false;
            }
        }));
        const delivered = results.filter(Boolean).length;
        return { sent: delivered > 0, subscriptionCount: subscriptions.length, delivered, failed: results.length - delivered };
    }
}
