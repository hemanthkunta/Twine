import { WebSocket } from 'ws';
import { AuthService } from '../../services/auth.service.js';
import { PresenceService, ConnectedClient } from '../../services/presence.service.js';
import { WSAuthHandshakePayload, WSAuthAckPayload } from '../../types/protocol.js';

export function handleAuthHandshake(
    socket: WebSocket,
    payload: WSAuthHandshakePayload,
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

    const sendError = (code: string, message: string) => {
        sendFrame('error', { code, message });
    };

    const decoded = AuthService.verifyToken(payload.token);

    if (!decoded) {
        sendError('UNAUTHORIZED', 'Invalid or expired auth token');
        socket.close(4001, 'Unauthorized');
        return { clientSession: null, registeredClient: null };
    }

    // Enforce session validity (revocation check)
    if (
        !decoded.session_id ||
        !AuthService.isSessionValid(decoded.session_id, decoded.id)
    ) {
        sendError('UNAUTHORIZED', 'Session revoked or invalid');
        socket.close(4001, 'Session revoked');
        return { clientSession: null, registeredClient: null };
    }

    const user = AuthService.getUserById(decoded.id);
    if (!user) {
        sendError('USER_NOT_FOUND', 'User record not found');
        socket.close(4001, 'User not found');
        return { clientSession: null, registeredClient: null };
    }

    const newClientSession = { userId: user.id, deviceId: payload.device_id };
    const newRegisteredClient = PresenceService.registerConnection(
        user.id,
        socket,
        payload.device_id
    );

    const ackPayload: WSAuthAckPayload = {
        user: { ...user, is_online: true },
        session_id: decoded.session_id,
        active_users_count: PresenceService.getOnlineUserIds().length,
    };

    sendFrame('auth:ack', ackPayload);

    return {
        clientSession: newClientSession,
        registeredClient: newRegisteredClient,
    };
}
