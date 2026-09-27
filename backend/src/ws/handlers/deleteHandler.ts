import { WebSocket } from 'ws';
import { ChatService } from '../../services/chat.service.js';
import { MessageService } from '../../services/message.service.js';
import { GroupService } from '../../services/group.service.js';
import { PresenceService } from '../../services/presence.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { WSDeleteMessagePayload } from '../../types/protocol.js';

export async function handleDeleteMessage(
    socket: WebSocket,
    payload: WSDeleteMessagePayload,
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

    const delPayload = payload;

    if (!delPayload.message_id) {
        sendError('INVALID_PAYLOAD', 'message_id is required');
        return { clientSession, registeredClient };
    }

    const message = await MessageService.getMessageById(delPayload.message_id);

    if (!message) {
        sendError('MESSAGE_NOT_FOUND', 'Message not found');
        return { clientSession, registeredClient };
    }

    if (!clientSession || !ChatService.isChatMember(message.chat_id, clientSession.userId)) {
        sendError('FORBIDDEN', 'You are not a member of this chat');
        return { clientSession, registeredClient };
    }

    // Membership is not ownership: a chat member may not delete another user's
    // message. Without this check `MessageService.deleteMessage` throws instead,
    // and the throw escapes the handler, so the client gets no error frame at all
    // (the row is still safe — its UPDATE is additionally guarded by
    // `AND sender_id = ?` — but the caller is left with a silent failure).
    if (message.sender_id !== clientSession.userId) {
        sendError('FORBIDDEN', 'Not authorized to delete this message');
        return { clientSession, registeredClient };
    }

    const { success, chatId } = MessageService.deleteMessage(
        delPayload.message_id,
        clientSession.userId
    );

    if (success) {
        const memberIds = ChatService.getChatMemberIds(chatId);

        const frame = {
            type: 'chat:message_deleted',
            payload: {
                message_id: delPayload.message_id,
                chat_id: chatId,
            },
            timestamp: Date.now(),
        };

        PresenceService.broadcastToUsers(memberIds, frame);
    }

    return { clientSession, registeredClient };
}
