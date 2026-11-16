import { Router, Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { AuthService } from '../services/auth.service.js';
import { ChatService } from '../services/chat.service.js';
import { MessageService } from '../services/message.service.js';
import { GroupService } from '../services/group.service.js';
import { MediaService, UPLOADS_DIR } from '../services/media.service.js';
import { AIService } from '../services/ai.service.js';
import { PresenceService } from '../services/presence.service.js';
import { ChannelAnalyticsService } from '../services/analytics.service.js';
import { FederationBridgeService } from '../services/federation.service.js';
import { PushNotificationService } from '../services/push.service.js';
import { BlockService } from '../services/block.service.js';
import { KeyDirectoryService } from '../services/keyDirectory.service.js';
import { SenderKeyService, BadRequestError, ForbiddenError } from '../services/senderKey.service.js';
import { ScheduledMessageService } from '../services/scheduledMessage.service.js';
import { HistoryTransferService } from '../services/historyTransfer.service.js';
import { RateLimiter } from '../middleware/rateLimiter.js';
import { TurnService } from '../services/turn.service.js';
import { MetricsService } from '../services/metrics.service.js';
import { LinkPreviewService } from '../services/LinkPreviewService.js';
import { checkDbHealth, db } from '../db/index.js';
import { config } from '../config/index.js';

export const router = Router();

const authRateLimiter = RateLimiter.createMiddleware(100, 5.0); // 100 burst
const apiRateLimiter = RateLimiter.createMiddleware(500, 50.0); // 500 burst
const uploadRateLimiter = RateLimiter.createMiddleware(50, 5.0); // 50 burst

// Strict rate limiters for 2FA endpoints
const twofaVerifyLimiter = RateLimiter.createMiddleware(5, 5.0 / 60.0); // 5 per minute
const twofaDisableLimiter = RateLimiter.createMiddleware(3, 3.0 / (5 * 60.0)); // 3 per 5 minutes
const twofaBackupCodesLimiter = RateLimiter.createMiddleware(5, 5.0 / (60 * 60.0)); // 5 per hour
const twofaEnableLimiter = RateLimiter.createMiddleware(3, 3.0 / (60 * 60.0)); // 3 per hour
const twofaChallengeLimiter = RateLimiter.createMiddleware(20, 20.0 / 60.0); // 20 per minute

// Global request metric recording & general rate limit (300 req/min)
router.use((req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
        MetricsService.recordHttpRequest(req.method, req.route?.path || req.path, res.statusCode);
    });
    next();
});

// Attach general API rate limiter globally to all API routes
router.use(apiRateLimiter);

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
        res.status(419).json({
            error: 'Missing or malformed Authorization header',
            code: 'AUTH_001',
        });
        return;
    }

    const token = header.slice('Bearer '.length).trim();

    if (!token) {
        res.status(419).json({
            error: 'Missing access token',
            code: 'AUTH_002',
        });
        return;
    }

    const decoded = AuthService.verifyToken(token);

    if (!decoded) {
        res.status(419).json({
            error: 'Invalid or expired token',
            code: 'AUTH_003',
        });
        return;
    }

    // Every access token must be bound to a real database session.
    if (!decoded.session_id) {
        res.status(419).json({
            error: 'Invalid session',
            code: 'AUTH_004',
        });
        return;
    }

    // Check that the session still exists and has not been revoked.
    const sessionValid = AuthService.isSessionValid(decoded.session_id, decoded.id);

    if (!sessionValid) {
        res.status(419).json({
            error: 'Session expired or revoked',
            code: 'AUTH_005',
        });
        return;
    }

    // Keep the session's activity timestamp current.
    AuthService.touchSession(decoded.session_id, decoded.id);

    (req as any).user = decoded;

    next();
}

// 1. Auth Endpoints (Protected with Auth Rate Limiter)
router.post('/auth/register', authRateLimiter, (req: Request, res: Response) => {
    try {
        const { phoneNumber, username, displayName, password, bio, avatarUrl } = req.body;

        if (!phoneNumber || !username || !displayName || !password) {
            res.status(400).json({
                error: 'phoneNumber, username, displayName, and password are required',
                code: 'VALIDATION_001',
            });
            return;
        }

        const result = AuthService.register({
            phoneNumber,
            username,
            displayName,
            password,
            bio,
            avatarUrl,
            deviceName: 'Web Browser',
            deviceType: 'web',
            ipAddress: req.ip,
        });

        res.status(201).json(result);
    } catch (err: any) {
        res.status(400).json({
            error: err.message || 'Registration failed',
        });
    }
});

router.post('/auth/login', authRateLimiter, (req: Request, res: Response) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            res.status(400).json({
                error: 'identifier and password are required',
                code: 'VALIDATION_002',
            });
            return;
        }

        const result = AuthService.loginWithTwoFactor(identifier, password, {
            deviceName: 'Web Browser',
            deviceType: 'web',
            ipAddress: req.ip,
        });

        // Accounts with 2FA enabled get a challenge instead of a session.
        if (result.kind === 'challenge') {
            res.json(result.challenge);
            return;
        }

        res.json(result.session);
    } catch (err: any) {
        res.status(401).json({
            error: 'Invalid credentials',
        });
    }
});

router.post('/auth/refresh', authRateLimiter, (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken || typeof refreshToken !== 'string') {
            res.status(400).json({
                error: 'refreshToken is required',
                code: 'VALIDATION_003',
            });
            return;
        }

        const result = AuthService.refreshAccessToken(refreshToken);

        res.json(result);
    } catch {
        res.status(401).json({
            error: 'Invalid or revoked refresh token',
        });
    }
});

router.post('/auth/demo-login', authRateLimiter, (req: Request, res: Response) => {
    if (config.isProduction) {
        res.status(403).json({
            error: 'Demo login is disabled in production environments',
            code: 'AUTH_006',
        });
        return;
    }

    try {
        const { userId } = req.body;
        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }
        const result = AuthService.demoLogin(userId);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Demo login failed' });
    }
});

router.post('/auth/request-otp', authRateLimiter, async (req: Request, res: Response) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            res.status(400).json({ error: 'phoneNumber is required' });
            return;
        }
        const result = await AuthService.requestOTP({ phoneNumber });
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Request OTP failed' });
    }
});

router.post('/auth/verify-otp', authRateLimiter, async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp } = req.body;
        if (!phoneNumber || !otp) {
            res.status(400).json({ error: 'phoneNumber and otp are required' });
            return;
        }
        const result = await AuthService.verifyOTPAndSignInWithChallenge({ phoneNumber, otp });

        // Accounts with 2FA enabled get a challenge instead of a session.
        if (result.kind === 'challenge') {
            res.json(result.challenge);
            return;
        }

        res.json(result.session);
    } catch (err: any) {
        if (err.message === 'Invalid or expired OTP') {
            res.status(400).json({ error: err.message });
        } else {
            res.status(400).json({ error: err.message || 'Verify OTP failed' });
        }
    }
});

// ==================== 2FA Routes ====================

// Start 2FA setup: returns secret, QR code URI, and QR code data URL.
// The secret is stored as pending; 2FA only becomes active after /auth/2fa/verify.
router.post('/auth/2fa/enable', twofaEnableLimiter, authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const result = await AuthService.enable2FA(userId);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Enable 2FA failed' });
    }
});

// Verify 2FA token. With a pending setup a correct code activates 2FA;
// otherwise the token is checked against the active secret.
// A wrong token is a normal response ({ valid: false }), not an error.
router.post('/auth/2fa/verify', twofaVerifyLimiter, authMiddleware, (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ error: 'token is required' });
            return;
        }
        const result = AuthService.verifyTwoFactorToken(userId, token);
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Verify 2FA failed' });
    }
});

// Complete a login challenge with a TOTP code or an unused backup code.
// On success the normal sign-in response is returned and the challenge is consumed.
router.post('/auth/2fa/challenge', twofaChallengeLimiter, async (req: Request, res: Response) => {
    try {
        const { challengeId, token } = req.body;
        if (!challengeId || !token) {
            res.status(400).json({ error: 'challengeId and token are required' });
            return;
        }
        const session = await AuthService.completeTwoFactorChallenge(challengeId, token);
        res.json(session);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Two-factor verification failed' });
    }
});

// Disable 2FA: requires TOTP token or backup code
router.post('/auth/2fa/disable', twofaDisableLimiter, authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ error: 'token (TOTP or backup code) is required' });
            return;
        }
        const success = await AuthService.disable2FA(userId, token);
        if (!success) {
            res.status(400).json({ error: 'Invalid token or backup code' });
            return;
        }
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Disable 2FA failed' });
    }
});

// Regenerate backup codes: requires valid TOTP token
router.post('/auth/2fa/backup-codes', twofaBackupCodesLimiter, authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { token } = req.body;
        if (!token) {
            res.status(400).json({ error: 'token is required' });
            return;
        }
        const backupCodes = await AuthService.regenerateBackupCodes(userId, token);
        if (!backupCodes) {
            res.status(400).json({ error: 'Invalid token' });
            return;
        }
        res.json({ backupCodes });
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Regenerate backup codes failed' });
    }
});

// Get 2FA status
router.get('/auth/2fa/status', authMiddleware, (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const status = AuthService.get2FAStatus(userId);
        res.json(status);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Get 2FA status failed' });
    }
});


router.get('/auth/demo-users', authRateLimiter, (_req: Request, res: Response) => {
    if (config.isProduction) {
        res.status(403).json({
            error: 'Demo user directory is disabled in production environments',
            code: 'AUTH_007',
        });
        return;
    }

    const users = AuthService.getAllDemoUsers();
    const enhanced = users.map((u) => ({
        ...u,
        is_online: u.is_bot ? true : PresenceService.isUserOnline(u.id),
    }));
    res.json({ users: enhanced });
});

router.get('/auth/me', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const user = AuthService.getUserById(userId);
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    res.json({ user: { ...user, is_online: true } });
});

// 2. Profile & Sessions
router.put('/users/profile', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const updated = AuthService.updateProfile(userId, req.body);
        PresenceService.sendToUser(userId, {
            type: 'user:profile_updated',
            payload: { user: updated },
            timestamp: Date.now(),
        });
        res.json({ user: updated });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/users/sessions', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const sessions = AuthService.getUserSessions(userId);
    res.json({ sessions });
});

router.post('/users/sessions/:id/revoke', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    AuthService.revokeSession(userId, req.params.id);
    PresenceService.sendToUser(userId, {
        type: 'auth:session_revoked',
        payload: { session_id: req.params.id },
        timestamp: Date.now(),
    });
    res.json({ success: true });
});

// Server-side logout: revokes the caller's current session (the session_id is
// embedded in the auth token by the auth middleware).
router.post('/auth/logout', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const sessionId = (req as any).user.session_id;

    if (sessionId) {
        AuthService.revokeSession(userId, sessionId);

        PresenceService.sendToUser(userId, {
            type: 'auth:session_revoked',
            payload: { session_id: sessionId },
            timestamp: Date.now(),
        });
    }

    res.json({ success: true });
});

// 3. User Directory & Search
router.get('/users/search', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const q = (req.query.q as string) || '';
    const results = AuthService.searchUsers(q, userId).map((u) => ({
        ...u,
        is_online: u.is_bot ? true : PresenceService.isUserOnline(u.id),
    }));
    res.json({ users: results });
});

// 4. Chats, Groups & Channels
router.get('/chats', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const userChats = await ChatService.getUserChats(userId);
    const chats = userChats.map((c) => {
        if (c.peer_user) {
            c.peer_user.is_online = c.peer_user.is_bot
                ? true
                : PresenceService.isUserOnline(c.peer_user.id);
        }
        return c;
    });
    res.json({ chats });
});

router.post('/chats/direct', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { targetUserId } = req.body;
    if (!targetUserId) {
        res.status(400).json({ error: 'targetUserId is required' });
        return;
    }
    try {
        const chat = await ChatService.getOrCreateDirectChat(userId, targetUserId);
        if (chat.peer_user) {
            chat.peer_user.is_online = chat.peer_user.is_bot
                ? true
                : PresenceService.isUserOnline(chat.peer_user.id);
        }
        res.json({ chat });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/groups/create', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { title, description, avatarUrl, type, memberIds } = req.body;
    if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
    }
    try {
        const group = await GroupService.createGroup({
            creatorId: userId,
            title,
            description,
            avatarUrl,
            type: type || 'GROUP',
            memberIds: memberIds || [],
        });
        res.status(201).json({ chat: group });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/chats/:id/members', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const members = ChatService.getChatMembers(chatId);
    res.json({ members });
});

router.get('/chats/:id/messages', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 100);

    const before = req.query.before as string | undefined;

    // `getChatMessages` is async: without the await, res.json() would serialise a
    // pending Promise as `{}` and the client would render an empty chat.
    const messages = await MessageService.getChatMessages(chatId, limit, before, userId);

    res.json({ messages });
});

router.post('/chats/:id/read-all', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const readMessageIds = MessageService.markChatMessagesAsRead(chatId, userId);

    // Immediately notify every connected member that these messages
    // have been read by this user.
    if (readMessageIds.length > 0) {
        const memberIds = ChatService.getChatMemberIds(chatId);

        for (const messageId of readMessageIds) {
            const updateFrame = {
                type: 'chat:receipt_update' as const,
                payload: {
                    chat_id: chatId,
                    message_id: messageId,
                    user_id: userId,
                    status: 'READ' as const,
                    timestamp: new Date().toISOString(),
                },
                timestamp: Date.now(),
            };

            PresenceService.broadcastToUsers(memberIds, updateFrame);
        }
    }

    res.json({
        success: true,
        count: readMessageIds.length,
        readMessageIds,
    });
});

// 5. Global Messages Search
router.get('/messages/search', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const query = (req.query.q as string) || '';
    const messages = await MessageService.searchMessages(userId, {
        query,
        chatId: (req.query.chatId as string) || undefined,
        senderId: (req.query.senderId as string) || undefined,
        // The client sends `messageType`; `type` is accepted as an alias.
        messageType: (req.query.messageType as string) || (req.query.type as string) || undefined,
        startDate: (req.query.startDate as string) || undefined,
        endDate: (req.query.endDate as string) || undefined,
    });
    res.json({ messages });
});

// 5b. Message Forwarding
// POST /messages/forward — copy a message into one or more chats the caller
// belongs to. hideAttribution drops forwarded_from_sender_id so recipients
// only see "Forwarded" without the original sender's name.
router.post('/messages/forward', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { messageId, targetChatIds, hideAttribution, destinationPayloads } = req.body ?? {};

    if (typeof messageId !== 'string' || messageId.trim() === '') {
        return res.status(400).json({ error: 'messageId is required' });
    }
    if (!Array.isArray(targetChatIds) || targetChatIds.length === 0) {
        return res.status(400).json({ error: 'targetChatIds must be a non-empty array' });
    }

    try {
        const messages = await MessageService.forwardMessage({
            userId,
            messageId,
            targetChatIds,
            hideAttribution: Boolean(hideAttribution),
            destinationPayloads,
        });
        res.json({ messages });
    } catch (err: any) {
        const msg: string = err?.message ?? 'Forward failed';
        if (msg === 'Message not found') {
            return res.status(404).json({ error: msg });
        }
        if (msg.includes('not a member') || msg.includes('not allowed')) {
            return res.status(403).json({ error: msg });
        }
        res.status(400).json({ error: msg });
    }
});
// 5c. Scheduled Messages
// POST /chats/:id/schedule queues a message for future delivery; the sweep in
// server.ts dispatches it through the normal send path (receipts + fanout).
router.post('/chats/:id/schedule', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;
    const { content, type, replyToMessageId, mediaUrl, mediaMetadata, scheduledAt } =
        req.body ?? {};

    if (typeof content !== 'string' || content.trim() === '') {
        return res.status(400).json({ error: 'content is required' });
    }
    const when = new Date(scheduledAt);
    if (!scheduledAt || isNaN(when.getTime())) {
        return res.status(400).json({ error: 'scheduledAt must be a valid ISO timestamp' });
    }

    try {
        const scheduled = ScheduledMessageService.create({
            chatId,
            senderId: userId,
            contentText: content,
            type,
            replyToMessageId,
            mediaUrl,
            mediaMetadata,
            scheduledAt: when,
        });
        res.json({ scheduled });
    } catch (err: any) {
        const msg: string = err?.message ?? 'Failed to schedule message';
        if (msg.includes('not a member')) {
            return res.status(403).json({ error: msg });
        }
        res.status(400).json({ error: msg });
    }
});

router.get('/chats/:id/scheduled', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const scheduled = ScheduledMessageService.listPending(req.params.id, userId);
        res.json({ scheduled });
    } catch (err: any) {
        res.status(403).json({ error: err?.message ?? 'Forbidden' });
    }
});

router.delete('/scheduled-messages/:id', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        ScheduledMessageService.cancel(req.params.id, userId);
        res.json({ success: true });
    } catch (err: any) {
        const msg: string = err?.message ?? 'Cancel failed';
        if (msg === 'Scheduled message not found') {
            return res.status(404).json({ error: msg });
        }
        res.status(msg.includes('authorized') ? 403 : 400).json({ error: msg });
    }
});

// 5d. Per-Chat Disappearing Messages (server-enforced TTL).
// Any member sets the chat default; new messages inherit it into expires_at
// and the sweep in server.ts hard-deletes them, broadcasting
// chat:message_deleted to all members/devices.
router.put('/chats/:id/disappearing', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;
    if (!ChatService.isChatMember(chatId, userId)) {
        return res.status(403).json({ error: 'Not a member of this chat' });
    }
    const { ttlSeconds } = req.body ?? {};
    if (typeof ttlSeconds !== 'number' || !Number.isInteger(ttlSeconds) || ttlSeconds < 0) {
        return res.status(400).json({ error: 'ttlSeconds must be a non-negative integer (0 = off)' });
    }
    if (ttlSeconds > 31536000) {
        return res.status(400).json({ error: 'TTL cannot exceed one year' });
    }
    ChatService.setDisappearingTtl(chatId, ttlSeconds);

    // Let every member's client update the chat (header badge, composer hint).
    PresenceService.broadcastToUsers(ChatService.getChatMemberIds(chatId), {
        type: 'chat:updated',
        payload: { chat_id: chatId, disappearing_ttl_seconds: ttlSeconds },
        timestamp: Date.now(),
    });
    res.json({ success: true, ttlSeconds });
});
//
// One authenticated, membership-checked handler serves two paths:
//   * `/media/:filename`   — the original route.
//   * `/uploads/:filename` — the exact URL shape `POST /media/upload` returns
//     (`UploadedMedia.url`) and that the client fetches via `getMediaUrl()`.
// Without the alias every uploaded file 404s, so pictures and voice notes never
// render even though the upload succeeded.
const serveMediaFile = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const filename = req.params.filename;

    // Prevent path traversal.
    const safeFilename = path.basename(filename);

    if (!safeFilename || safeFilename !== filename) {
        res.status(400).json({
            error: 'Invalid media filename',
        });
        return;
    }

    const filePath = path.join(UPLOADS_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
        res.status(404).json({
            error: 'Media file not found',
        });
        return;
    }

    // A file may be referenced by several chats or used as a profile photo.
    const mediaUrl = `/uploads/${safeFilename}`;

    const row = db
        .prepare(
            `
            SELECT m.chat_id FROM messages m
            JOIN chat_members cm ON cm.chat_id = m.chat_id AND cm.user_id = ?
            WHERE m.media_url = ? AND m.is_deleted = 0
              AND (m.expires_at IS NULL OR m.expires_at > datetime('now'))
              AND m.created_at > COALESCE(cm.cleared_at, '')
            LIMIT 1
            `
        )
        .get(userId, mediaUrl) as { chat_id: string } | undefined;

    const avatar = db.prepare(`SELECT u.id FROM users u
        JOIN media_upload_owners mo ON mo.media_url = u.avatar_url AND mo.user_id = u.id
        WHERE u.avatar_url = ? AND
        (u.id = ? OR EXISTS (SELECT 1 FROM chat_members owner JOIN chat_members viewer
          ON owner.chat_id = viewer.chat_id WHERE owner.user_id = u.id AND viewer.user_id = ?))
        UNION SELECT c.id FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
          JOIN media_upload_owners mo ON mo.media_url = c.avatar_url AND mo.user_id = c.creator_id
          WHERE c.avatar_url = ? AND cm.user_id = ? LIMIT 1`)
        .get(mediaUrl, userId, userId, mediaUrl, userId);

    if (!row && !avatar) {
        res.status(403).json({
            error: 'You are not authorized to access this media',
        });
        return;
    }

    // User must belong to the chat containing the file.
    if (row && !ChatService.isChatMember(row.chat_id, userId)) {
        res.status(403).json({
            error: 'You are not authorized to access this media',
        });
        return;
    }

    res.sendFile(filePath);
};

router.get('/media/:filename', authMiddleware, serveMediaFile);
router.get('/uploads/:filename', authMiddleware, serveMediaFile);

router.post('/chats/:id/clear', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    db.prepare('UPDATE messages SET is_deleted = 1 WHERE chat_id = ?').run(chatId);
    res.json({ success: true, message: 'Chat history cleared' });
});

router.post('/chats/:id/mute', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    db.prepare('UPDATE chat_members SET is_muted = 1 WHERE chat_id = ? AND user_id = ?').run(
        chatId,
        userId
    );
    res.json({ success: true, is_muted: true });
});

router.post('/chats/:id/unmute', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    db.prepare('UPDATE chat_members SET is_muted = 0 WHERE chat_id = ? AND user_id = ?').run(
        chatId,
        userId
    );
    res.json({ success: true, is_muted: false });
});

// 6. Media Uploads
router.post('/media/upload', authMiddleware, uploadRateLimiter, (req: Request, res: Response) => {
    try {
        const { base64Data, fileName, mimeType, waveform } = req.body;
        if (!base64Data || !fileName || !mimeType) {
            res.status(400).json({ error: 'base64Data, fileName, and mimeType are required' });
            return;
        }
        const uploaded = MediaService.saveBase64Media({ base64Data, fileName, mimeType, waveform });
        db.prepare('INSERT INTO media_upload_owners (media_url, user_id) VALUES (?, ?)').run(uploaded.url, (req as any).user.id);
        res.json({ media: uploaded });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Media upload failed' });
    }
});

// 7. AI Assistant Endpoints
router.post('/ai/summarize', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { chatId } = req.body;

    if (!chatId) {
        res.status(400).json({ error: 'chatId is required' });
        return;
    }

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    try {
        const messages = await MessageService.getChatMessages(chatId, 50);
        const summary = AIService.summarizeChat(messages);
        res.json(summary);
    } catch (err: any) {
        res.status(500).json({
            error: err.message || 'Failed to summarize chat',
        });
    }
});

router.get('/ai/smart-replies/:chatId', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.chatId;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    try {
        const messages = await MessageService.getChatMessages(chatId, 10);
        const replies = AIService.generateSmartReplies(messages, userId);
        res.json(replies);
    } catch (err: any) {
        res.status(500).json({
            error: err.message || 'Failed to generate smart replies',
        });
    }
});

router.post('/ai/translate', authMiddleware, (req: Request, res: Response) => {
    const { text, targetLang } = req.body;
    if (!text || !targetLang) {
        res.status(400).json({ error: 'text and targetLang are required' });
        return;
    }
    const translated = AIService.translateMessage(text, targetLang);
    res.json({ original: text, translated, targetLang });
});

router.post('/ai/semantic-search', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { query, chatId } = req.body;

    if (!query) {
        res.status(400).json({ error: 'query is required' });
        return;
    }

    if (chatId && !ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const allMessages = chatId
        ? await MessageService.getChatMessages(chatId, 100, undefined, userId)
        : await MessageService.searchMessages(userId, { query });

    const results = AIService.semanticSearch(query, allMessages.filter(m => !m.ciphertext_payload));
    res.json({ results });
});

router.post('/ai/transcribe-voice', authMiddleware, (req: Request, res: Response) => {
    const { audioUrl, duration } = req.body;
    if (!audioUrl) {
        res.status(400).json({ error: 'audioUrl is required' });
        return;
    }
    const transcription = AIService.transcribeVoice(audioUrl, duration);
    res.json(transcription);
});

router.post('/ai/moderate', authMiddleware, (req: Request, res: Response) => {
    const { text, sensitivity } = req.body;
    if (!text) {
        res.status(400).json({ error: 'text is required' });
        return;
    }
    const moderation = AIService.moderateContent(text, sensitivity || 'MEDIUM');
    res.json(moderation);
});

router.post('/ai/call-summary', authMiddleware, (req: Request, res: Response) => {
    const { durationSeconds, callerName } = req.body;
    const summary = AIService.generateCallSummary(durationSeconds || 120, callerName || 'Peer');
    res.json(summary);
});

router.post('/ai/suggest-topics', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { chatId, chatTitle } = req.body;

    if (!chatId) {
        res.status(400).json({ error: 'chatId is required' });
        return;
    }

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const messages = await MessageService.getChatMessages(chatId, 30);
    const suggestions = AIService.suggestGroupTopics(chatTitle || 'Group', messages);
    res.json(suggestions);
});

// 8. Polls & Quizzes
router.post('/polls/create', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { chatId, question, options, isAnonymous, isQuiz, correctOptionId, explanation } =
        req.body;

    if (!chatId || !question || !options || options.length < 2) {
        res.status(400).json({
            error: 'chatId, question, and at least 2 options are required',
        });
        return;
    }

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    try {
        const message = await MessageService.createPoll({
            chatId,
            senderId: userId,
            question,
            options,
            isAnonymous,
            isQuiz,
            correctOptionId,
            explanation,
        });

        res.json({ message });
    } catch (err: any) {
        res.status(400).json({
            error: err.message || 'Failed to create poll',
        });
    }
});

router.post('/polls/vote', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { pollId, optionId } = req.body;

    if (!pollId || !optionId) {
        res.status(400).json({
            error: 'pollId and optionId are required',
        });
        return;
    }

    try {
        const poll = await MessageService.votePoll(pollId, optionId, userId);

        if (!poll) {
            res.status(404).json({
                error: 'Poll not found or closed',
            });
            return;
        }

        res.json({ poll });
    } catch (err: any) {
        if (err.message === 'You are not a member of this chat') {
            res.status(403).json({
                error: err.message,
            });
            return;
        }

        res.status(400).json({
            error: err.message || 'Failed to vote on poll',
        });
    }
});

// 9. Threaded Replies
router.get('/threads/:parentMessageId', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const parentMessageId = req.params.parentMessageId;

    const parent = await MessageService.getMessageById(parentMessageId);

    if (!parent) {
        res.status(404).json({
            error: 'Message not found',
        });
        return;
    }

    if (!ChatService.isChatMember(parent.chat_id, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const messages = await MessageService.getThreadMessages(parentMessageId);

    res.json({ parent, messages });
});

// 10. Channel Analytics & Federation
router.get('/channels/:chatId/analytics', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.chatId;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const messages = await MessageService.getChatMessages(chatId, 50);

    const analytics = ChannelAnalyticsService.getChannelAnalytics(chatId, 'Channel', messages);

    res.json(analytics);
});

router.get('/federation/status', authMiddleware, (_req: Request, res: Response) => {
    const status = FederationBridgeService.getBridgeStatus();
    res.json(status);
});

// 11. Push Notifications
router.get('/push/config', authMiddleware, (_req, res) => {
    res.json({ publicKey: PushNotificationService.getPublicKey() });
});
router.delete('/push/subscribe', authMiddleware, (req, res) => {
    PushNotificationService.removeSubscription((req as any).user.id, req.body.endpoint);
    res.json({ success: true });
});
router.post('/push/subscribe', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { subscription } = req.body;
    try {
        PushNotificationService.saveSubscription({ ...subscription, userId });
        res.json({ success: true });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// 12. User Blocking & Unblocking
router.post('/users/:id/block', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const targetUserId = req.params.id;
    const success = BlockService.blockUser(userId, targetUserId);
    res.json({ success, blocked_user_id: targetUserId });
});

router.post('/users/:id/unblock', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const targetUserId = req.params.id;
    const success = BlockService.unblockUser(userId, targetUserId);
    res.json({ success, unblocked_user_id: targetUserId });
});

router.get('/users/blocked', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const blockedUserIds = BlockService.getBlockedUserIds(userId);
    res.json({ blockedUserIds });
});

// E2EE Public-Key Directory (identity keys + wrapped group sender keys).
// Only public keys and opaque sealed blobs travel over the wire; private key
// material never leaves the client (see client/src/services/e2ee.ts).
router.post('/keys/publish', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { publicKey } = req.body ?? {};
    if (!KeyDirectoryService.isValidPublicKey(publicKey)) {
        res.status(400).json({ error: 'Invalid public key format', code: 'KEYS_001' });
        return;
    }
    try {
        const stored = KeyDirectoryService.publish(userId, publicKey);
        res.json({ user_id: stored.user_id, public_key: stored.public_key });
    } catch (err: any) {
        console.error('[Key Publish Error]', err);
        res.status(500).json({ error: 'Failed to publish identity key' });
    }
});

router.get('/keys/:userId', authMiddleware, (req: Request, res: Response) => {
    const stored = KeyDirectoryService.get(req.params.userId);
    if (!stored) {
        res.status(404).json({ error: 'No identity key published for this user', code: 'KEYS_404' });
        return;
    }
    res.json({ user_id: stored.user_id, public_key: stored.public_key });
});

// E2EE Key Exchange - Pre-key Bundle Exchange (X3DH)
router.post('/keys/bundle', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const {
        registrationId,
        deviceId,
        preKeyId,
        preKeyPublic,
        signedPreKeyId,
        signedPreKeyPublic,
        signedPreKeySignature,
        identityKey,
        oneTimePreKeys
    } = req.body ?? {};

    // Validate required fields
    if (!registrationId || !deviceId || !preKeyId || !preKeyPublic ||
        !signedPreKeyId || !signedPreKeyPublic ||
        !signedPreKeySignature || !identityKey) {
        res.status(400).json({ error: 'Missing required pre-key bundle fields', code: 'KEYS_002' });
        return;
    }

    // Validate deviceId is a positive integer
    if (typeof deviceId !== 'number' || deviceId <= 0 || !Number.isInteger(deviceId)) {
        res.status(400).json({ error: 'Invalid deviceId', code: 'KEYS_001' });
        return;
    }

    // Verify the device is registered to this user and not revoked
    const device = KeyDirectoryService.getDevice(userId, deviceId);
    if (!device) {
        res.status(404).json({ error: 'Device not found or not registered to this user', code: 'DEVICE_404' });
        return;
    }
    if (device.isRevoked) {
        res.status(403).json({ error: 'Device has been revoked', code: 'DEVICE_REVOKED' });
        return;
    }

    // Validate the signed pre-key signature
    if (!await KeyDirectoryService.verifySignedPreKey(identityKey, signedPreKeyPublic, signedPreKeySignature)) {
        res.status(400).json({ error: 'Invalid signed pre-key signature', code: 'KEYS_003' });
        return;
    }

    try {
        KeyDirectoryService.storePreKeyBundle(userId, {
            registrationId,
            deviceId,
            preKeyId,
            preKeyPublic,
            signedPreKeyId,
            signedPreKeyPublic,
            signedPreKeySignature,
            identityKey,
            oneTimePreKeys: oneTimePreKeys || []
        });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[PreKey Bundle Store Error]', err);
        res.status(500).json({ error: 'Failed to store pre-key bundle', code: 'KEYS_500' });
    }
});

router.get('/keys/bundle/:userId', authMiddleware, async (req: Request, res: Response) => {
    const targetUserId = req.params.userId;
    const requesterId = (req as any).user.id;

    // Prevent users from requesting their own bundle
    if (targetUserId === requesterId) {
        res.status(400).json({ error: 'Cannot request own pre-key bundle', code: 'KEYS_004' });
        return;
    }

    const bundle = KeyDirectoryService.getPreKeyBundle(targetUserId);
    if (!bundle) {
        res.status(404).json({ error: 'No pre-key bundle available for this user', code: 'KEYS_404' });
        return;
    }

    // Consume a one-time pre-key if available
    const oneTimePreKey = KeyDirectoryService.consumeOneTimePreKey(targetUserId, bundle.deviceId);
    if (oneTimePreKey) {
        bundle.oneTimePreKeys = [oneTimePreKey];
    }

    res.json({ bundle });
});

// Device Management API
// List all registered devices for the authenticated user
router.get('/keys/devices/:userId', authMiddleware, (req, res) => {
    const devices = KeyDirectoryService.listDevices(req.params.userId)
        .filter(device => !device.isRevoked)
        .map(({ deviceId, publicKey, isRevoked }) => ({ deviceId, publicKey, isRevoked, deviceName: null }));
    res.json({ devices });
});
router.get('/devices', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const devices = KeyDirectoryService.listDevices(userId);
    res.json({ devices });
});

// Register a new device for the authenticated user
router.post('/devices', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { deviceId, deviceName, publicKey } = req.body ?? {};

    if (!deviceId || typeof deviceId !== 'number') {
        res.status(400).json({ error: 'Invalid deviceId', code: 'DEVICE_001' });
        return;
    }
    if (!KeyDirectoryService.isValidPublicKey(publicKey)) {
        res.status(400).json({ error: 'Invalid public key format', code: 'DEVICE_002' });
        return;
    }

    try {
        const device = KeyDirectoryService.registerDevice(userId, deviceId, deviceName ?? null, publicKey);
        res.json({ device });
    } catch (err: any) {
        console.error('[Device Register Error]', err);
        res.status(500).json({ error: 'Failed to register device', code: 'DEVICE_500' });
    }
});

// Get a specific device
router.get('/devices/:deviceId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const deviceId = parseInt(req.params.deviceId, 10);

    if (isNaN(deviceId)) {
        res.status(400).json({ error: 'Invalid deviceId', code: 'DEVICE_001' });
        return;
    }

    const device = KeyDirectoryService.getDevice(userId, deviceId);
    if (!device) {
        res.status(404).json({ error: 'Device not found', code: 'DEVICE_404' });
        return;
    }

    res.json({ device });
});

// Revoke a device
router.delete('/devices/:deviceId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const deviceId = parseInt(req.params.deviceId, 10);

    if (isNaN(deviceId)) {
        res.status(400).json({ error: 'Invalid deviceId', code: 'DEVICE_001' });
        return;
    }

    const success = KeyDirectoryService.revokeDevice(userId, deviceId);
    if (!success) {
        res.status(404).json({ error: 'Device not found or already revoked', code: 'DEVICE_404' });
        return;
    }

    res.json({ success: true });
});

// Get pre-key bundle for a specific device
router.get('/keys/bundle/:userId/:deviceId', authMiddleware, async (req: Request, res: Response) => {
    const targetUserId = req.params.userId;
    const targetDeviceId = parseInt(req.params.deviceId, 10);
    const requesterId = (req as any).user.id;

    if (isNaN(targetDeviceId)) {
        res.status(400).json({ error: 'Invalid deviceId', code: 'KEYS_001' });
        return;
    }

    // Prevent users from requesting their own bundle
    if (targetUserId === requesterId) {
        res.status(400).json({ error: 'Cannot request own pre-key bundle', code: 'KEYS_004' });
        return;
    }

    // Verify the target device exists and is not revoked
    const device = KeyDirectoryService.getDevice(targetUserId, targetDeviceId);
    if (!device) {
        res.status(404).json({ error: 'Device not found', code: 'DEVICE_404' });
        return;
    }
    if (device.isRevoked) {
        res.status(403).json({ error: 'Device has been revoked', code: 'DEVICE_REVOKED' });
        return;
    }

    const bundle = KeyDirectoryService.getPreKeyBundle(targetUserId, targetDeviceId);
    if (!bundle) {
        res.status(404).json({ error: 'No pre-key bundle available for this device', code: 'KEYS_404' });
        return;
    }

    // Consume a one-time pre-key if available
    const oneTimePreKey = KeyDirectoryService.consumeOneTimePreKey(targetUserId, targetDeviceId);
    if (oneTimePreKey) {
        bundle.oneTimePreKeys = [oneTimePreKey];
    }

    res.json({ bundle });
});
// sealed to the recipient's identity key in the browser before upload, so the
// server stores and routes the blob but cannot read any group message.
router.post('/chats/:id/sender-keys', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;
    const { keys } = req.body ?? {};
    try {
        // SenderKeyService validates membership (sender + every recipient),
        // the sealed {n,c} shape of each wrap, and per-request caps before
        // writing anything.
        const { stored } = SenderKeyService.publish(chatId, userId, keys);
        res.json({ success: true, stored });
    } catch (err: any) {
        if (err instanceof ForbiddenError) {
            res.status(403).json({ error: err.message, code: 'KEYS_403' });
            return;
        }
        if (err instanceof BadRequestError) {
            res.status(400).json({ error: err.message, code: 'KEYS_002' });
            return;
        }
        console.error('[Sender Keys Upload Error]', err);
        res.status(500).json({ error: 'Failed to store sender keys' });
    }
});

router.get('/chats/:id/sender-keys', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.id;
    try {
        // Sender keys this chat's members have addressed TO the caller, plus
        // the distinct recipients the CALLER has already distributed to, so
        // one round trip answers "is anything missing?".
        const keys = SenderKeyService.getForRecipient(chatId, userId);
        const myRecipients = SenderKeyService.getMyRecipients(chatId, userId);
        res.json({ keys, my_recipients: myRecipients });
    } catch (err: any) {
        if (err instanceof ForbiddenError) {
            res.status(403).json({ error: err.message, code: 'KEYS_403' });
            return;
        }
        console.error('[Sender Keys Fetch Error]', err);
        res.status(500).json({ error: 'Failed to fetch sender keys' });
    }
});

// 13. WebRTC Dynamic Time-Limited TURN Credentials (HMAC-SHA1 / Managed API)
router.get('/turn-credentials', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const credentials = await TurnService.generateCredentials(userId);
        res.json(credentials);
    } catch (err: any) {
        console.error('[TURN Endpoint Error]', err);
        res.status(500).json({ error: 'Failed to generate TURN credentials' });
    }
});

// Link Preview Endpoint
router.post('/links/preview', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
        res.status(400).json({
            error: 'URL is required',
            code: 'VALIDATION_001',
        });
        return;
    }

    try {
        // Check if we have a cached preview first
        const cachedPreview = LinkPreviewService.getCachedPreview(url);
        if (cachedPreview) {
            res.json({ preview: cachedPreview });
            return;
        }

        // Fetch fresh preview
        const preview = await LinkPreviewService.fetchPreview(url);
        if (preview) {
            res.json({ preview });
        } else {
            res.status(404).json({
                error: 'Unable to fetch preview for the provided URL',
                code: 'LINK_PREVIEW_001',
            });
        }
    } catch (err: any) {
        console.error('[Link Preview Endpoint Error]', err);
        res.status(500).json({ error: 'Failed to generate link preview' });
    }
});

// 14. Health & Readiness Probes & Prometheus Metrics
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        onlineUsersCount: PresenceService.getOnlineUserIds().length,
    });
});

router.get('/ready', (_req: Request, res: Response) => {
    const dbOk = checkDbHealth();
    if (dbOk) {
        res.json({
            status: 'ready',
            database: 'connected',
            timestamp: new Date().toISOString(),
        });
    } else {
        res.status(503).json({
            status: 'not_ready',
            database: 'disconnected',
            timestamp: new Date().toISOString(),
        });
    }
});

// =============================================================================
// History Transfer API
// =============================================================================

// Initiate a history transfer from source device
router.post('/history-transfer/initiate', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const {
        sourceDeviceId,
        destDeviceId,
        destUserId,
        policy
    } = req.body ?? {};

    if (!sourceDeviceId || !destDeviceId || !destUserId) {
        res.status(400).json({ error: 'Missing required fields: sourceDeviceId, destDeviceId, destUserId', code: 'TRANSFER_001' });
        return;
    }

    if (typeof sourceDeviceId !== 'number' || sourceDeviceId <= 0 || !Number.isInteger(sourceDeviceId) ||
        typeof destDeviceId !== 'number' || destDeviceId <= 0 || !Number.isInteger(destDeviceId)) {
        res.status(400).json({ error: 'Invalid deviceId', code: 'TRANSFER_002' });
        return;
    }

    try {
        const result = await HistoryTransferService.initiateTransfer(
            userId,
            sourceDeviceId,
            destUserId,
            destDeviceId,
            policy || { include_groups: true, include_direct: true, date_range: null }
        );

        res.json({
            transferId: result.transferId,
            challenge: result.challenge.toString('base64'),
            sourceEphemeralPubKey: result.sourceEphemeralPubKey.toString('base64'),
            expiresAt: result.expiresAt,
        });
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to initiate transfer', code: 'TRANSFER_003' });
    }
});

// Destination device approves the transfer
router.post('/history-transfer/authorize', authMiddleware, async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { transferId, signature, destEphemeralPubKey } = req.body ?? {};

    if (!transferId || !signature) {
        res.status(400).json({ error: 'Missing required fields: transferId, signature', code: 'TRANSFER_001' });
        return;
    }

    try {
        const result = await HistoryTransferService.authorizeTransfer(
            userId,
            transferId,
            signature,
            destEphemeralPubKey
        );
        res.json(result);
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to authorize transfer', code: 'TRANSFER_005' });
    }
});

// Check transfer status
router.get('/history-transfer/status/:transferId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { transferId } = req.params;

    const status = HistoryTransferService.getTransferStatus(userId, transferId);
    if (!status) {
        res.status(404).json({ error: 'Transfer not found', code: 'TRANSFER_404' });
        return;
    }

    res.json(status);
});

// Cancel a transfer
router.post('/history-transfer/cancel/:transferId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { transferId } = req.params;

    try {
        HistoryTransferService.cancelTransfer(userId, transferId);
        res.json({ success: true });
    } catch (err: any) {
        res.status(404).json({ error: err.message || 'Transfer not found', code: 'TRANSFER_404' });
    }
});

// Complete a transfer
router.post('/history-transfer/complete/:transferId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { transferId } = req.params;

    if (!HistoryTransferService.isTransferValid(transferId)) {
        res.status(400).json({ error: 'Transfer is not active or has expired', code: 'TRANSFER_006' });
        return;
    }

    const status = HistoryTransferService.getTransferStatus(userId, transferId);
    if (!status) {
        res.status(404).json({ error: 'Transfer not found', code: 'TRANSFER_404' });
        return;
    }

    HistoryTransferService.completeTransfer(transferId);
    res.json({ success: true });
});

// Relay an encrypted history batch from source to destination
router.post('/history-transfer/batch/:transferId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { transferId } = req.params;
    const { batchSeq, envelope } = req.body ?? {};

    if (typeof batchSeq !== 'number' || !Number.isInteger(batchSeq) || batchSeq < 0) {
        res.status(400).json({ error: 'Invalid batchSeq', code: 'TRANSFER_007' });
        return;
    }
    if (typeof envelope !== 'string' || envelope.length === 0) {
        res.status(400).json({ error: 'Missing envelope', code: 'TRANSFER_008' });
        return;
    }

    const status = HistoryTransferService.getTransferStatus(userId, transferId);
    if (!status) {
        res.status(404).json({ error: 'Transfer not found', code: 'TRANSFER_404' });
        return;
    }
    if (!status.isSource) {
        res.status(403).json({ error: 'Only the source device can send batches', code: 'TRANSFER_009' });
        return;
    }
    if (!HistoryTransferService.isTransferValid(transferId)) {
        res.status(400).json({ error: 'Transfer is not active or has expired', code: 'TRANSFER_006' });
        return;
    }

    const envelopeBytes = Buffer.from(envelope, 'base64');
    HistoryTransferService.recordBatchSent(transferId, batchSeq, 0, envelopeBytes.length);

    res.json({ success: true });
});

// Acknowledge receipt of a history batch
router.post('/history-transfer/ack/:transferId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { transferId } = req.params;
    const { batchSeq, success } = req.body ?? {};

    if (typeof batchSeq !== 'number' || !Number.isInteger(batchSeq) || batchSeq < 0) {
        res.status(400).json({ error: 'Invalid batchSeq', code: 'TRANSFER_007' });
        return;
    }

    const status = HistoryTransferService.getTransferStatus(userId, transferId);
    if (!status) {
        res.status(404).json({ error: 'Transfer not found', code: 'TRANSFER_404' });
        return;
    }
    if (!status.isDest) {
        res.status(403).json({ error: 'Only the destination device can acknowledge batches', code: 'TRANSFER_010' });
        return;
    }

    HistoryTransferService.recordBatchAck(transferId, batchSeq, success !== false);
    res.json({ success: true });
});

// List active transfers for the current user
router.get('/history-transfer/list', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    res.json({ transfers: HistoryTransferService.listActiveTransfers(userId) });
});

router.get('/metrics', authMiddleware, (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(MetricsService.getMetricsText());
});
