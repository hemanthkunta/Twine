import { WebSocket } from 'ws';
import { AuthService } from '../../services/auth.service.js';
import { PresenceService } from '../../services/presence.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { BlockService } from '../../services/block.service.js';
import {
    WSWebRtcCallUserPayload,
    WSWebRtcAnswerPayload,
    WSWebRtcIceCandidatePayload,
    WSWebRtcHangupPayload,
    WSWebRtcRenegotiatePayload,
} from '../../types/protocol.js';

export function handleWebRtcCallUser(
    socket: WebSocket,
    payload: WSWebRtcCallUserPayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): {
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: ConnectedClient | null;
} {
    const sendFrame = (type: string, payload: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
            const frame = {
                type,
                payload,
                correlation_id: correlationId,
                timestamp: Date.now(),
            };
            socket.send(JSON.stringify(frame));
        }
    };

    if (!clientSession) {
        // This should not happen if dispatcher checks authentication, but just in case
        const sendError = (code: string, message: string) => {
            sendFrame('error', { code, message });
        };
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    const caller = AuthService.getUserById(clientSession.userId);
    if (!caller) return { clientSession, registeredClient };

    if (BlockService.isBlocked(clientSession.userId, payload.target_user_id)) {
        sendFrame('webrtc:call_ended', {
            call_id: payload.call_id,
            user_id: payload.target_user_id,
            reason: 'blocked',
        });
        return { clientSession, registeredClient };
    }

    const targetOnline = PresenceService.isUserOnline(payload.target_user_id);

    if (!targetOnline) {
        sendFrame('webrtc:call_ended', {
            call_id: payload.call_id,
            user_id: payload.target_user_id,
            reason: 'offline',
        });
        return { clientSession, registeredClient };
    }

    PresenceService.sendToUser(payload.target_user_id, {
        type: 'webrtc:incoming_call',
        payload: {
            call_id: payload.call_id,
            caller_id: clientSession.userId,
            call_type: payload.call_type,
            caller: {
                id: caller.id,
                username: caller.username,
                display_name: caller.display_name,
                avatar_url: caller.avatar_url,
            },
            offer: payload.offer,
        },
        timestamp: Date.now(),
    });
    return { clientSession, registeredClient };
}

export function handleWebRtcAnswer(
    socket: WebSocket,
    payload: WSWebRtcAnswerPayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): {
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: ConnectedClient | null;
} {
    const sendFrame = (type: string, payload: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
            const frame = {
                type,
                payload,
                correlation_id: correlationId,
                timestamp: Date.now(),
            };
            socket.send(JSON.stringify(frame));
        }
    };

    if (!clientSession) {
        const sendError = (code: string, message: string) => {
            sendFrame('error', { code, message });
        };
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    PresenceService.sendToUser(payload.target_user_id, {
        type: 'webrtc:call_accepted',
        payload: {
            call_id: payload.call_id,
            responder_id: clientSession.userId,
            answer: payload.answer,
        },
        timestamp: Date.now(),
    });
    return { clientSession, registeredClient };
}

export function handleWebRtcIceCandidate(
    socket: WebSocket,
    payload: WSWebRtcIceCandidatePayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): {
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: ConnectedClient | null;
} {
    const sendFrame = (type: string, payload: unknown, correlationId?: string) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type,
                    payload,
                    correlation_id: correlationId,
                    timestamp: Date.now(),
                })
            );
        }
    };

    if (!clientSession) {
        const sendError = (code: string, message: string) => {
            sendFrame('error', { code, message });
        };
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    const icePayload = payload;
    PresenceService.sendToUser(icePayload.target_user_id, {
        type: 'webrtc:ice_candidate',
        payload: {
            call_id: icePayload.call_id,
            sender_id: clientSession.userId,
            candidate: icePayload.candidate,
        },
        timestamp: Date.now(),
    });
    return { clientSession, registeredClient };
}

export function handleWebRtcHangup(
    socket: WebSocket,
    payload: WSWebRtcHangupPayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): {
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: ConnectedClient | null;
} {
    const sendFrame = (type: string, payload: unknown, correlationId?: string) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type,
                    payload,
                    correlation_id: correlationId,
                    timestamp: Date.now(),
                })
            );
        }
    };

    if (!clientSession) {
        const sendError = (code: string, message: string) => {
            sendFrame('error', { code, message });
        };
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    const hangupPayload = payload;
    PresenceService.sendToUser(hangupPayload.target_user_id, {
        type: 'webrtc:call_ended',
        payload: {
            call_id: hangupPayload.call_id,
            user_id: clientSession.userId,
            reason: hangupPayload.reason,
        },
        timestamp: Date.now(),
    });
    return { clientSession, registeredClient };
}

export function handleWebRtcRenegotiate(
    socket: WebSocket,
    payload: WSWebRtcRenegotiatePayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): {
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: ConnectedClient | null;
} {
    const sendFrame = (type: string, payload: unknown, correlationId?: string) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type,
                    payload,
                    correlation_id: correlationId,
                    timestamp: Date.now(),
                })
            );
        }
    };

    if (!clientSession) {
        const sendError = (code: string, message: string) => {
            sendFrame('error', { code, message });
        };
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    const renPayload = payload;
    PresenceService.sendToUser(renPayload.target_user_id, {
        type: 'webrtc:renegotiate',
        payload: {
            call_id: renPayload.call_id,
            sender_id: clientSession.userId,
            offer: renPayload.offer,
            answer: renPayload.answer,
            is_screen_sharing: renPayload.is_screen_sharing,
            is_video_active: renPayload.is_video_active,
        },
        timestamp: Date.now(),
    });
    return { clientSession, registeredClient };
}
