import { WebSocket } from 'ws';
import { ChatService } from '../../services/chat.service.js';
import { PresenceService } from '../../services/presence.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { WSUserTypingPayload } from '../../types/protocol.js';
import { safeSend, createFrame } from './frameUtils.js';

export function handleTyping(
    socket: WebSocket,
    payload: WSUserTypingPayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): { clientSession: { userId: string; deviceId?: string } | null; registeredClient: ConnectedClient | null } {
    const sendFrame = (type: string, payload: unknown) => {
        safeSend(socket, createFrame(type, payload, correlationId));
    };

    const sendError = (code: string, message: string) => {
        sendFrame('error', { code, message });
    };

    const typingPayload = payload;

    if (!typingPayload.chat_id) {
        sendError('INVALID_PAYLOAD', 'chat_id is required');
        return { clientSession, registeredClient };
    }

    if (!clientSession || !ChatService.isChatMember(typingPayload.chat_id, clientSession?.userId ?? '')) {
        sendError('FORBIDDEN', 'You are not a member of this chat');
        return { clientSession, registeredClient };
    }

    const memberIds = ChatService.getChatMemberIds(typingPayload.chat_id);

    PresenceService.broadcastTyping(
        typingPayload.chat_id,
        clientSession?.userId ?? '',
        memberIds,
        Boolean(typingPayload.is_typing)
    );

    return { clientSession, registeredClient };
}