import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'node:http';
import { AuthService } from '../services/auth.service.js';
import { ChatService } from '../services/chat.service.js';
import { MessageService } from '../services/message.service.js';
import { GroupService } from '../services/group.service.js';
import { PresenceService } from '../services/presence.service.js';
import { AIService } from '../services/ai.service.js';
import { RateLimiter } from '../middleware/rateLimiter.js';
import { MetricsService } from '../services/metrics.service.js';
import { clusterBroker } from '../services/cluster.service.js';
import {
    WSFrame,
    WSAuthHandshakePayload,
    WSSendMessagePayload,
    WSEditMessagePayload,
    WSDeleteMessagePayload,
    WSReactPayload,
    WSPinMessagePayload,
    WSTypingPayload,
    WSReadReceiptPayload,
    WebRTCCallPayload,
    WebRTCAnswerPayload,
    WebRTCIceCandidatePayload,
    WebRTCHangupPayload,
    WSAuthAckPayload,
    WSMessageAckPayload,
    WSNewMessagePayload,
    WSReceiptUpdatePayload,
} from '../types/protocol.js';

export function setupWebSocketGateway(server: Server) {
    const wss = new WebSocketServer({ server, path: '/ws' });

    wss.on('connection', (socket: WebSocket) => {
        MetricsService.incrementWsConnections();
        let clientSession: { userId: string; deviceId?: string } | null = null;
        let registeredClient: any = null;

        const sendFrame = (type: string, payload: any, correlationId?: string) => {
            if (socket.readyState === WebSocket.OPEN) {
                MetricsService.recordWsMessageSent();
                const frame: WSFrame = {
                    type,
                    payload,
                    correlation_id: correlationId,
                    timestamp: Date.now(),
                };
                socket.send(JSON.stringify(frame));
            }
        };

        const sendError = (code: string, message: string, correlationId?: string) => {
            sendFrame('error', { code, message }, correlationId);
        };

        socket.on('message', async (raw: string) => {
            MetricsService.recordWsMessageReceived();
            try {
                const frame: WSFrame = JSON.parse(raw.toString());
                const { type, payload, correlation_id } = frame;

                if (clientSession && !RateLimiter.checkWsLimit(clientSession.userId, 50)) {
                    sendError(
                        'RATE_LIMIT_EXCEEDED',
                        'WebSocket frame rate limit exceeded (max 50 frames/sec)',
                        correlation_id
                    );
                    return;
                }

                // 1. Handshake Authentication
                if (type === 'auth:handshake') {
                    const authPayload = payload as WSAuthHandshakePayload;
                    const decoded = AuthService.verifyToken(authPayload.token);

                    if (!decoded) {
                        sendError('UNAUTHORIZED', 'Invalid or expired auth token', correlation_id);
                        socket.close(4001, 'Unauthorized');
                        return;
                    }

                    const user = AuthService.getUserById(decoded.id);
                    if (!user) {
                        sendError('USER_NOT_FOUND', 'User record not found', correlation_id);
                        socket.close(4001, 'User not found');
                        return;
                    }

                    clientSession = { userId: user.id, deviceId: authPayload.device_id };
                    registeredClient = PresenceService.registerConnection(
                        user.id,
                        socket,
                        authPayload.device_id
                    );

                    const ackPayload: WSAuthAckPayload = {
                        user: { ...user, is_online: true },
                        session_id: `sess_${Date.now()}`,
                        active_users_count: PresenceService.getOnlineUserIds().length,
                    };

                    sendFrame('auth:ack', ackPayload, correlation_id);
                    return;
                }

                // Must be authenticated for all other events
                if (!clientSession) {
                    sendError(
                        'UNAUTHENTICATED',
                        'Must complete auth:handshake first',
                        correlation_id
                    );
                    return;
                }

                const senderId = clientSession.userId;

                // 2. Chat: Send Message
                if (type === 'chat:send_message') {
                    const msgPayload = payload as WSSendMessagePayload;

                    if (!msgPayload.chat_id) {
                        sendError('INVALID_PAYLOAD', 'chat_id is required', correlation_id);
                        return;
                    }

                    // Authorization: sender must be a member of the target chat.
                    if (!ChatService.isChatMember(msgPayload.chat_id, senderId)) {
                        sendError('FORBIDDEN', 'You are not a member of this chat', correlation_id);
                        return;
                    }

                    const message = MessageService.createMessage({
                        chatId: msgPayload.chat_id,
                        senderId,
                        contentText: msgPayload.content,
                        type: msgPayload.type || 'TEXT',
                        replyToMessageId: msgPayload.reply_to_id,
                        ciphertextPayload: msgPayload.ciphertext_payload,
                        mediaUrl: msgPayload.media_url,
                        mediaMetadata: msgPayload.media_metadata,
                    });

                    // Acknowledge back to sender
                    const ack: WSMessageAckPayload = {
                        temp_id: msgPayload.temp_id,
                        message_id: message.id,
                        chat_id: message.chat_id,
                        created_at: message.created_at,
                        status: message.status,
                    };
                    sendFrame('chat:message_ack', ack, correlation_id);

                    // Broadcast to chat members (excluding this specific socket, sending to all other sockets including other devices of the sender)
                    const memberIds = ChatService.getChatMemberIds(message.chat_id);
                    const newMsgFrame: WSFrame<WSNewMessagePayload> = {
                        type: 'chat:new_message',
                        payload: { message, chat_id: message.chat_id },
                        timestamp: Date.now(),
                    };

                    PresenceService.broadcastToUsers(memberIds, newMsgFrame, socket);

                    // Mark DELIVERED for online members
                    for (const memberId of memberIds) {
                        if (memberId !== senderId && PresenceService.isUserOnline(memberId)) {
                            MessageService.updateReceipt(message.id, memberId, 'DELIVERED');
                            const receiptPayload: WSReceiptUpdatePayload = {
                                chat_id: message.chat_id,
                                message_id: message.id,
                                user_id: memberId,
                                status: 'DELIVERED',
                                timestamp: new Date().toISOString(),
                            };
                            sendFrame('chat:receipt_update', receiptPayload);
                        }
                    }

                    // 🤖 Check for AI Bot trigger (@ai or Direct AI Chat)
                    const isDirectAIChat = memberIds.includes('usr_ai_bot');
                    const hasAITrigger = message.content_text
                        .trim()
                        .toLowerCase()
                        .startsWith('@ai');

                    if (isDirectAIChat || hasAITrigger) {
                        setTimeout(() => {
                            // Send typing indicator from AI bot
                            PresenceService.broadcastTyping(
                                message.chat_id,
                                'usr_ai_bot',
                                memberIds,
                                true
                            );

                            setTimeout(() => {
                                PresenceService.broadcastTyping(
                                    message.chat_id,
                                    'usr_ai_bot',
                                    memberIds,
                                    false
                                );
                                const cleanPrompt = message.content_text.replace(/^@ai\s*/i, '');
                                const history = MessageService.getChatMessages(message.chat_id, 10);
                                const botReplyText = AIService.generateBotResponse(
                                    cleanPrompt,
                                    history
                                );

                                const botMessage = MessageService.createMessage({
                                    chatId: message.chat_id,
                                    senderId: 'usr_ai_bot',
                                    contentText: botReplyText,
                                    type: 'TEXT',
                                    replyToMessageId: message.id,
                                });

                                const botFrame: WSFrame<WSNewMessagePayload> = {
                                    type: 'chat:new_message',
                                    payload: { message: botMessage, chat_id: message.chat_id },
                                    timestamp: Date.now(),
                                };
                                PresenceService.broadcastToUsers(memberIds, botFrame);
                            }, 1200);
                        }, 400);
                    }

                    return;
                }

                // 3. Chat: Edit Message
                if (type === 'chat:edit_message') {
                    const editPayload = payload as WSEditMessagePayload;

                    if (!editPayload.message_id) {
                        sendError('INVALID_PAYLOAD', 'message_id is required', correlation_id);
                        return;
                    }

                    if (
                        typeof editPayload.content_text !== 'string' ||
                        !editPayload.content_text.trim()
                    ) {
                        sendError('INVALID_PAYLOAD', 'content_text is required', correlation_id);
                        return;
                    }

                    const message = MessageService.getMessageById(editPayload.message_id);

                    if (!message) {
                        sendError('MESSAGE_NOT_FOUND', 'Message not found', correlation_id);
                        return;
                    }

                    if (!ChatService.isChatMember(message.chat_id, senderId)) {
                        sendError('FORBIDDEN', 'You are not a member of this chat', correlation_id);
                        return;
                    }

                    if (message.sender_id !== senderId) {
                        sendError(
                            'FORBIDDEN',
                            'Not authorized to edit this message',
                            correlation_id
                        );
                        return;
                    }

                    const updated = MessageService.editMessage(
                        editPayload.message_id,
                        senderId,
                        editPayload.content_text
                    );

                    if (updated) {
                        const memberIds = ChatService.getChatMemberIds(message.chat_id);

                        const frame: WSFrame = {
                            type: 'chat:message_edited',
                            payload: {
                                message: updated,
                                chat_id: message.chat_id,
                            },
                            timestamp: Date.now(),
                        };

                        PresenceService.broadcastToUsers(memberIds, frame);
                    }

                    return;
                }

                // 4. Chat: Delete Message
                if (type === 'chat:delete_message') {
                    const delPayload = payload as WSDeleteMessagePayload;

                    if (!delPayload.message_id) {
                        sendError('INVALID_PAYLOAD', 'message_id is required', correlation_id);
                        return;
                    }

                    const message = MessageService.getMessageById(delPayload.message_id);

                    if (!message) {
                        sendError('MESSAGE_NOT_FOUND', 'Message not found', correlation_id);
                        return;
                    }

                    if (!ChatService.isChatMember(message.chat_id, senderId)) {
                        sendError('FORBIDDEN', 'You are not a member of this chat', correlation_id);
                        return;
                    }

                    const { success, chatId } = MessageService.deleteMessage(
                        delPayload.message_id,
                        senderId
                    );

                    if (success) {
                        const memberIds = ChatService.getChatMemberIds(chatId);

                        const frame: WSFrame = {
                            type: 'chat:message_deleted',
                            payload: {
                                message_id: delPayload.message_id,
                                chat_id: chatId,
                            },
                            timestamp: Date.now(),
                        };

                        PresenceService.broadcastToUsers(memberIds, frame);
                    }

                    return;
                }

                // 5. Chat: React to Message
                if (type === 'chat:react') {
                    const reactPayload = payload as WSReactPayload;
                    const { chatId, reactions } = MessageService.toggleReaction(
                        reactPayload.message_id,
                        senderId,
                        reactPayload.emoji
                    );
                    const memberIds = ChatService.getChatMemberIds(chatId);
                    const frame: WSFrame = {
                        type: 'chat:reaction_updated',
                        payload: {
                            message_id: reactPayload.message_id,
                            chat_id: chatId,
                            reactions,
                        },
                        timestamp: Date.now(),
                    };
                    PresenceService.broadcastToUsers(memberIds, frame);
                    return;
                }

                // 6. Chat: Pin Message
                if (type === 'chat:pin_message') {
                    const pinPayload = payload as WSPinMessagePayload;
                    if (pinPayload.is_pinned) {
                        GroupService.pinMessage(
                            pinPayload.chat_id,
                            pinPayload.message_id,
                            senderId
                        );
                    } else {
                        GroupService.unpinMessage(pinPayload.chat_id);
                    }
                    const memberIds = ChatService.getChatMemberIds(pinPayload.chat_id);
                    const pinnedMsg = pinPayload.is_pinned
                        ? MessageService.getMessageById(pinPayload.message_id)
                        : null;
                    const frame: WSFrame = {
                        type: 'chat:message_pinned',
                        payload: { chat_id: pinPayload.chat_id, pinned_message: pinnedMsg },
                        timestamp: Date.now(),
                    };
                    PresenceService.broadcastToUsers(memberIds, frame);
                    return;
                }

                // 7. Chat: Typing
                if (type === 'chat:typing') {
                    const typingPayload = payload as WSTypingPayload;

                    if (!typingPayload.chat_id) {
                        sendError('INVALID_PAYLOAD', 'chat_id is required', correlation_id);
                        return;
                    }

                    if (!ChatService.isChatMember(typingPayload.chat_id, senderId)) {
                        sendError('FORBIDDEN', 'You are not a member of this chat', correlation_id);
                        return;
                    }

                    const memberIds = ChatService.getChatMemberIds(typingPayload.chat_id);

                    PresenceService.broadcastTyping(
                        typingPayload.chat_id,
                        senderId,
                        memberIds,
                        Boolean(typingPayload.is_typing)
                    );

                    return;
                }

                // 8. Chat: Read Receipt
                if (type === 'chat:read_receipt') {
                    const receiptPayload = payload as WSReadReceiptPayload;

                    if (!receiptPayload.chat_id || !receiptPayload.message_id) {
                        sendError(
                            'INVALID_PAYLOAD',
                            'chat_id and message_id are required',
                            correlation_id
                        );
                        return;
                    }

                    if (!ChatService.isChatMember(receiptPayload.chat_id, senderId)) {
                        sendError('FORBIDDEN', 'You are not a member of this chat', correlation_id);
                        return;
                    }

                    const message = MessageService.getMessageById(receiptPayload.message_id);

                    if (!message || message.chat_id !== receiptPayload.chat_id) {
                        sendError(
                            'INVALID_MESSAGE',
                            'Message does not belong to this chat',
                            correlation_id
                        );
                        return;
                    }

                    const { updated, chat_id } = MessageService.updateReceipt(
                        receiptPayload.message_id,
                        senderId,
                        'READ'
                    );
                    if (updated && chat_id) {
                        const memberIds = ChatService.getChatMemberIds(chat_id);
                        const updateFrame: WSFrame<WSReceiptUpdatePayload> = {
                            type: 'chat:receipt_update',
                            payload: {
                                chat_id,
                                message_id: receiptPayload.message_id,
                                user_id: senderId,
                                status: 'READ',
                                timestamp: new Date().toISOString(),
                            },
                            timestamp: Date.now(),
                        };
                        PresenceService.broadcastToUsers(memberIds, updateFrame, socket);
                    }
                    return;
                }

                // 9. WebRTC Signaling: Call User
                if (type === 'webrtc:call_user') {
                    const callPayload = payload as WebRTCCallPayload;
                    const caller = AuthService.getUserById(senderId);
                    if (!caller) return;

                    PresenceService.sendToUser(callPayload.target_user_id, {
                        type: 'webrtc:incoming_call',
                        payload: {
                            call_id: callPayload.call_id,
                            caller_id: senderId,
                            call_type: callPayload.call_type,
                            caller: {
                                id: caller.id,
                                username: caller.username,
                                display_name: caller.display_name,
                                avatar_url: caller.avatar_url,
                            },
                            offer: callPayload.offer,
                        },
                        timestamp: Date.now(),
                    });
                    return;
                }

                // 10. WebRTC Signaling: Answer
                if (type === 'webrtc:answer') {
                    const answerPayload = payload as WebRTCAnswerPayload;
                    PresenceService.sendToUser(answerPayload.target_user_id, {
                        type: 'webrtc:call_accepted',
                        payload: {
                            call_id: answerPayload.call_id,
                            responder_id: senderId,
                            answer: answerPayload.answer,
                        },
                        timestamp: Date.now(),
                    });
                    return;
                }

                // 11. WebRTC Signaling: ICE Candidate
                if (type === 'webrtc:ice_candidate') {
                    const icePayload = payload as WebRTCIceCandidatePayload;
                    PresenceService.sendToUser(icePayload.target_user_id, {
                        type: 'webrtc:ice_candidate',
                        payload: {
                            call_id: icePayload.call_id,
                            sender_id: senderId,
                            candidate: icePayload.candidate,
                        },
                        timestamp: Date.now(),
                    });
                    return;
                }

                // 12. WebRTC Signaling: Hangup / Reject
                if (type === 'webrtc:hangup') {
                    const hangupPayload = payload as WebRTCHangupPayload;
                    PresenceService.sendToUser(hangupPayload.target_user_id, {
                        type: 'webrtc:call_ended',
                        payload: {
                            call_id: hangupPayload.call_id,
                            user_id: senderId,
                            reason: hangupPayload.reason,
                        },
                        timestamp: Date.now(),
                    });
                    return;
                }

                // 13. Presence: Heartbeat
                if (type === 'presence:heartbeat') {
                    AuthService.updateLastSeen(senderId);
                    sendFrame('presence:ack', { timestamp: Date.now() }, correlation_id);
                    return;
                }

                sendError('UNKNOWN_EVENT_TYPE', `Unhandled event: ${type}`, correlation_id);
            } catch (err) {
                const message =
                    err instanceof Error ? err.message : 'Server error processing packet';

                if (
                    message === 'Not authorized to delete this message' ||
                    message === 'You are not a member of this chat' ||
                    message === 'Not authorized to edit this message'
                ) {
                    sendError('FORBIDDEN', message);
                    return;
                }

                sendError('INTERNAL_ERROR', message);
            }
        });

        socket.on('close', () => {
            MetricsService.decrementWsConnections();
            if (registeredClient) {
                PresenceService.removeConnection(registeredClient);
            }
        });

        socket.on('error', (err) => {
            MetricsService.decrementWsConnections();
            console.error('Socket error:', err);
            if (registeredClient) {
                PresenceService.removeConnection(registeredClient);
            }
        });
    });

    console.log('⚡ Complete WebSocket Gateway initialized at /ws');
    return wss;
}
