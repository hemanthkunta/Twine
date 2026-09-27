import { WebSocket } from 'ws';
import { MessageService } from '../../services/message.service.js';
import { ChatService } from '../../services/chat.service.js';
import { PresenceService } from '../../services/presence.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { WSReactPayload } from '../../types/protocol.js';

export function handleReaction(
    socket: WebSocket,
    payload: WSReactPayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): { clientSession: { userId: string; deviceId?: string } | null; registeredClient: ConnectedClient | null } {
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

    const reactPayload = payload;

    if (!clientSession) {
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    const { chatId, reactions } = MessageService.toggleReaction(
        reactPayload.message_id,
        clientSession.userId,
        reactPayload.emoji
    );

    const memberIds = ChatService.getChatMemberIds(chatId);
    const frame = {
        type: 'chat:reaction_updated',
        payload: {
            message_id: reactPayload.message_id,
            chat_id: chatId,
            reactions,
        },
        timestamp: Date.now(),
    };

    PresenceService.broadcastToUsers(memberIds, frame);

    return { clientSession, registeredClient };
}