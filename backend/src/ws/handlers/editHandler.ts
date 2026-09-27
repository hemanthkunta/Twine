import { WebSocket } from 'ws';
import { ChatService } from '../../services/chat.service.js';
import { MessageService } from '../../services/message.service.js';
import { PresenceService } from '../../services/presence.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { WSEditMessagePayload } from '../../types/protocol.js';

export async function handleEditMessage(
    socket: WebSocket,
    payload: WSEditMessagePayload,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): Promise<{
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: ConnectedClient | null;
}> {
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

    const editPayload = payload;

    if (!editPayload.message_id) {
        sendError('INVALID_PAYLOAD', 'message_id is required');
        return { clientSession, registeredClient };
    }

    if (typeof editPayload.content_text !== 'string' || !editPayload.content_text.trim()) {
        sendError('INVALID_PAYLOAD', 'content_text is required');
        return { clientSession, registeredClient };
    }

    const message = await MessageService.getMessageById(editPayload.message_id);

    if (!message) {
        sendError('MESSAGE_NOT_FOUND', 'Message not found');
        return { clientSession, registeredClient };
    }

    if (!clientSession || !ChatService.isChatMember(message.chat_id, clientSession.userId)) {
        sendError('FORBIDDEN', 'You are not a member of this chat');
        return { clientSession, registeredClient };
    }

    if (message.sender_id !== clientSession.userId) {
        sendError('FORBIDDEN', 'Not authorized to edit this message');
        return { clientSession, registeredClient };
    }

    const updated = await MessageService.editMessage(
        editPayload.message_id,
        clientSession.userId,
        editPayload.content_text
    );

    if (updated) {
        const memberIds = ChatService.getChatMemberIds(message.chat_id);

        const frame = {
            type: 'chat:message_edited',
            payload: {
                message: updated,
                chat_id: message.chat_id,
            },
            timestamp: Date.now(),
        };

        PresenceService.broadcastToUsers(memberIds, frame);
    }

    return { clientSession, registeredClient };
}
