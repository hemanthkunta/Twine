import { WebSocket } from 'ws';
import { AuthService } from '../services/auth.service.js';
import { ChatService } from '../services/chat.service.js';
import { MessageService } from '../services/message.service.js';
import { GroupService } from '../services/group.service.js';
import { PresenceService, ConnectedClient } from '../services/presence.service.js';
import { AIService } from '../services/ai.service.js';
import { BlockService } from '../services/block.service.js';
import { RateLimiter } from '../middleware/rateLimiter.js';
import { MetricsService } from '../services/metrics.service.js';
import { clusterBroker } from '../services/cluster.service.js';
import { handleAuthHandshake } from './handlers/authHandler.js';
import { handleSendMessage } from './handlers/messageHandler.js';
import { handleEditMessage } from './handlers/editHandler.js';
import { handleDeleteMessage } from './handlers/deleteHandler.js';
import { handleReaction } from './handlers/reactionHandler.js';
import { handlePinMessage } from './handlers/pinHandler.js';
import { handleTyping } from './handlers/typingHandler.js';
import { handleReadReceipt } from './handlers/readReceiptHandler.js';
import {
    handleWebRtcCallUser,
    handleWebRtcAnswer,
    handleWebRtcIceCandidate,
    handleWebRtcHangup,
    handleWebRtcRenegotiate,
} from './handlers/webrtcHandler.js';
import { handlePresenceHeartbeat } from './handlers/presenceHandler.js';
import { handleRequestPreKeyBundle } from './handlers/keyExchangeHandler.js';
import { handlePreKeyBundle } from './handlers/keyExchangeHandler.js';
import { handleDashboardConnect, handleDashboardDisconnect, handleDashboardPing } from './handlers/dashboardHandler.js';

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
    WSWebRtcCallUserPayload,
    WSWebRtcAnswerPayload,
    WSWebRtcIceCandidatePayload,
    WSWebRtcHangupPayload,
    WSWebRtcRenegotiatePayload,
    WSAuthAckPayload,
    WSMessageAckPayload,
    WSNewMessagePayload,
    WSReceiptUpdatePayload,
    WSRequestPreKeyBundlePayload,
    WSPreKeyBundlePayload,
} from '../types/protocol.js';

export async function handleMessage(
    socket: WebSocket,
    raw: string,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    ip: string
): Promise<{
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: ConnectedClient | null;
}> {
    MetricsService.recordWsMessageReceived();
    try {
        const frame: WSFrame = JSON.parse(raw.toString());
        const { type, payload, correlation_id = '' } = frame;

        if (clientSession && !RateLimiter.checkWsLimit(clientSession.userId, 50)) {
            const sendError = (code: string, message: string, correlationId?: string) => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(
                        JSON.stringify({
                            type: 'error',
                            payload: { code, message },
                            correlation_id: correlationId,
                            timestamp: Date.now(),
                        })
                    );
                }
            };
            sendError(
                'RATE_LIMIT_EXCEEDED',
                'WebSocket frame rate limit exceeded (max 50 frames/sec)',
                correlation_id
            );
            return { clientSession, registeredClient };
        }

        // Route to appropriate handler based on message type
        switch (type) {
            case 'auth:handshake':
                return handleAuthHandshake(
                    socket,
                    payload as WSAuthHandshakePayload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'chat:send_message':
                return handleSendMessage(
                    socket,
                    payload as WSSendMessagePayload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'chat:edit_message':
                return handleEditMessage(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'chat:delete_message':
                return handleDeleteMessage(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'chat:react':
                return handleReaction(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'chat:pin_message':
                return handlePinMessage(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'chat:typing':
                return handleTyping(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'chat:read_receipt':
                return handleReadReceipt(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'webrtc:call_user':
                return handleWebRtcCallUser(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'webrtc:answer':
                return handleWebRtcAnswer(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'webrtc:ice_candidate':
                return handleWebRtcIceCandidate(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'webrtc:hangup':
                return handleWebRtcHangup(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'webrtc:renegotiate':
                return handleWebRtcRenegotiate(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'presence:heartbeat':
                return handlePresenceHeartbeat(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'dashboard:connect':
                return handleDashboardConnect(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'dashboard:disconnect':
                return handleDashboardDisconnect(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'dashboard:ping':
                return handleDashboardPing(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'key:request_prekey_bundle':
                return handleRequestPreKeyBundle(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            case 'key:prekey_bundle':
                return handlePreKeyBundle(
                    socket,
                    payload,
                    clientSession,
                    registeredClient,
                    correlation_id
                );

            default: {
                const sendError = (code: string, message: string, correlationId?: string) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(
                            JSON.stringify({
                                type: 'error',
                                payload: { code, message },
                                correlation_id: correlationId,
                                timestamp: Date.now(),
                            })
                        );
                    }
                };
                sendError('UNKNOWN_EVENT_TYPE', `Unhandled event: ${type}`, correlation_id);
                return { clientSession, registeredClient };
            }
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Server error processing packet';

        if (
            message === 'Not authorized to delete this message' ||
            message === 'You are not a member of this chat' ||
            message === 'Not authorized to edit this message'
        ) {
            const sendError = (code: string, message: string, correlationId?: string) => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(
                        JSON.stringify({
                            type: 'error',
                            payload: { code, message },
                            correlation_id: correlationId,
                            timestamp: Date.now(),
                        })
                    );
                }
            };
            sendError('FORBIDDEN', message);
            return { clientSession, registeredClient };
        }

        const sendError = (code: string, message: string, correlationId?: string) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(
                    JSON.stringify({
                        type: 'error',
                        payload: { code, message },
                        correlation_id: correlationId,
                        timestamp: Date.now(),
                    })
                );
            }
        };
        sendError('INTERNAL_ERROR', message);
        return { clientSession, registeredClient };
    }
}