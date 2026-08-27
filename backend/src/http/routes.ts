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
import { RateLimiter } from '../middleware/rateLimiter.js';
import { MetricsService } from '../services/metrics.service.js';
import { checkDbHealth, db } from '../db/index.js';
import { config } from '../config/index.js';

export const router = Router();

const authRateLimiter = RateLimiter.createMiddleware(20, 0.33); // 20 burst, 20/min
const apiRateLimiter = RateLimiter.createMiddleware(300, 5.0); // 300 burst, 300/min
const uploadRateLimiter = RateLimiter.createMiddleware(30, 0.5); // 30 burst, 30/min

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
        res.status(401).json({
            error: 'Missing or malformed Authorization header',
        });
        return;
    }

    const token = header.slice('Bearer '.length).trim();

    if (!token) {
        res.status(401).json({
            error: 'Missing access token',
        });
        return;
    }

    const decoded = AuthService.verifyToken(token);

    if (!decoded) {
        res.status(401).json({
            error: 'Invalid or expired token',
        });
        return;
    }

    // Every access token must be bound to a real database session.
    if (!decoded.session_id) {
        res.status(401).json({
            error: 'Invalid session',
        });
        return;
    }

    // Check that the session still exists and has not been revoked.
    const sessionValid = AuthService.isSessionValid(decoded.session_id, decoded.id);

    if (!sessionValid) {
        res.status(401).json({
            error: 'Session expired or revoked',
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
            });
            return;
        }

        const result = AuthService.login(identifier, password, {
            deviceName: 'Web Browser',
            deviceType: 'web',
            ipAddress: req.ip,
        });

        res.json(result);
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
        res.status(403).json({ error: 'Demo login is disabled in production environments' });
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

router.get('/auth/demo-users', authRateLimiter, (_req: Request, res: Response) => {
    if (config.isProduction) {
        res.status(403).json({ error: 'Demo user directory is disabled in production environments' });
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
router.get('/chats', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chats = ChatService.getUserChats(userId).map((c) => {
        if (c.peer_user) {
            c.peer_user.is_online = c.peer_user.is_bot
                ? true
                : PresenceService.isUserOnline(c.peer_user.id);
        }
        return c;
    });
    res.json({ chats });
});

router.post('/chats/direct', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { targetUserId } = req.body;
    try {
        const chat = ChatService.getOrCreateDirectChat(userId, targetUserId);
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

router.post('/groups/create', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { title, description, avatarUrl, type, memberIds } = req.body;
    if (!title) {
        res.status(400).json({ error: 'Title is required' });
        return;
    }
    try {
        const group = GroupService.createGroup({
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

router.get('/chats/:id/messages', authMiddleware, (req: Request, res: Response) => {
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

    const messages = MessageService.getChatMessages(chatId, limit, before);

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
router.get('/messages/search', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const query = (req.query.q as string) || '';
    const messages = MessageService.searchMessages(userId, query);
    res.json({ messages });
});

// Protected Media Downloads
// Protected Media Downloads
router.get('/media/:filename', authMiddleware, (req: Request, res: Response) => {
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

    // Find the message that owns this media file.
    const mediaUrl = `/uploads/${safeFilename}`;

    const row = db
        .prepare(
            `
            SELECT chat_id
            FROM messages
            WHERE media_url = ?
              AND is_deleted = 0
            LIMIT 1
            `
        )
        .get(mediaUrl) as { chat_id: string } | undefined;

    if (!row) {
        res.status(404).json({
            error: 'Media record not found',
        });
        return;
    }

    // User must belong to the chat containing the file.
    if (!ChatService.isChatMember(row.chat_id, userId)) {
        res.status(403).json({
            error: 'You are not authorized to access this media',
        });
        return;
    }

    res.sendFile(filePath);
});

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

    db.prepare('UPDATE chat_members SET is_muted = 1 WHERE chat_id = ? AND user_id = ?').run(chatId, userId);
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

    db.prepare('UPDATE chat_members SET is_muted = 0 WHERE chat_id = ? AND user_id = ?').run(chatId, userId);
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
        res.json({ media: uploaded });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Media upload failed' });
    }
});

// 7. AI Assistant Endpoints
router.post('/ai/summarize', authMiddleware, (req: Request, res: Response) => {
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
        const messages = MessageService.getChatMessages(chatId, 50);
        const summary = AIService.summarizeChat(messages);
        res.json(summary);
    } catch (err: any) {
        res.status(500).json({
            error: err.message || 'Failed to summarize chat',
        });
    }
});

router.get('/ai/smart-replies/:chatId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.chatId;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    try {
        const messages = MessageService.getChatMessages(chatId, 10);
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

router.post('/ai/semantic-search', authMiddleware, (req: Request, res: Response) => {
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
        ? MessageService.getChatMessages(chatId, 100)
        : MessageService.searchMessages(userId, query);

    const results = AIService.semanticSearch(query, allMessages);
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

router.post('/ai/suggest-topics', authMiddleware, (req: Request, res: Response) => {
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

    const messages = MessageService.getChatMessages(chatId, 30);
    const suggestions = AIService.suggestGroupTopics(chatTitle || 'Group', messages);
    res.json(suggestions);
});

// 8. Polls & Quizzes
router.post('/polls/create', authMiddleware, (req: Request, res: Response) => {
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
        const message = MessageService.createPoll({
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

router.post('/polls/vote', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { pollId, optionId } = req.body;

    if (!pollId || !optionId) {
        res.status(400).json({
            error: 'pollId and optionId are required',
        });
        return;
    }

    try {
        const poll = MessageService.votePoll(pollId, optionId, userId);

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
router.get('/threads/:parentMessageId', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const parentMessageId = req.params.parentMessageId;

    const parent = MessageService.getMessageById(parentMessageId);

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

    const messages = MessageService.getThreadMessages(parentMessageId);

    res.json({ parent, messages });
});

// 10. Channel Analytics & Federation
router.get('/channels/:chatId/analytics', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const chatId = req.params.chatId;

    if (!ChatService.isChatMember(chatId, userId)) {
        res.status(403).json({
            error: 'You are not a member of this chat',
        });
        return;
    }

    const messages = MessageService.getChatMessages(chatId, 50);

    const analytics = ChannelAnalyticsService.getChannelAnalytics(chatId, 'Channel', messages);

    res.json(analytics);
});

router.get('/federation/status', authMiddleware, (_req: Request, res: Response) => {
    const status = FederationBridgeService.getBridgeStatus();
    res.json(status);
});

// 11. Push Notifications
router.post('/push/subscribe', authMiddleware, (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { subscription } = req.body;
    PushNotificationService.saveSubscription({ ...subscription, userId });
    res.json({ success: true });
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

// 13. Health & Readiness Probes & Prometheus Metrics
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

router.get('/metrics', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(MetricsService.getMetricsText());
});
