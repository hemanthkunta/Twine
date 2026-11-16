import { WebSocket } from 'ws';
import { AuthService } from '../../services/auth.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { WSHeartbeatPayload } from '../../types/protocol.js';
import { safeSend, createFrame } from './frameUtils.js';

export function handlePresenceHeartbeat(
    socket: WebSocket,
    payload: WSHeartbeatPayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): { clientSession: { userId: string; deviceId?: string } | null; registeredClient: ConnectedClient | null } {
    const sendFrame = (type: string, payload: unknown, correlationId?: string) => {
        safeSend(socket, createFrame(type, payload, correlationId));
    };

    if (!clientSession) {
        // This should not happen if dispatcher checks authentication, but just in case
        const sendError = (code: string, message: string) => {
            sendFrame('error', { code, message });
        };
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    AuthService.updateLastSeen(clientSession.userId);
    sendFrame('presence:ack', { timestamp: Date.now() }, correlationId);
    return { clientSession, registeredClient };
}