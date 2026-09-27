import { WebSocket } from 'ws';
import { MessageService } from '../../services/message.service.js';
import { ChatService } from '../../services/chat.service.js';
import { PresenceService } from '../../services/presence.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { WSReadReceiptPayload } from '../../types/protocol.js';

export async function handleReadReceipt(
    socket: WebSocket,
    payload: WSReadReceiptPayload,
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

    const receiptPayload = payload;

    if (!receiptPayload.chat_id || !receiptPayload.message_id) {
        sendError('INVALID_PAYLOAD', 'chat_id and message_id are required');
        return { clientSession, registeredClient };
    }

    if (
        !clientSession ||
        !ChatService.isChatMember(receiptPayload.chat_id, clientSession?.userId ?? '')
    ) {
        sendError('FORBIDDEN', 'You are not a member of this chat');
        return { clientSession, registeredClient };
    }

    const message = await MessageService.getMessageById(receiptPayload.message_id);

    if (!message || message.chat_id !== receiptPayload.chat_id) {
        sendError('INVALID_MESSAGE', 'Message does not belong to this chat');
        return { clientSession, registeredClient };
    }

    const { updated, chat_id } = MessageService.updateReceipt(
        receiptPayload.message_id,
        clientSession?.userId ?? '',
        'READ'
    );
    if (updated && chat_id) {
        const memberIds = ChatService.getChatMemberIds(chat_id);
        const updateFrame = {
            type: 'chat:receipt_update',
            payload: {
                chat_id,
                message_id: receiptPayload.message_id,
                user_id: clientSession?.userId ?? '',
                status: 'READ',
                timestamp: new Date().toISOString(),
            },
            timestamp: Date.now(),
        };
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(updateFrame));
        }
        PresenceService.broadcastToUsers(memberIds, updateFrame, socket);
    }
    return { clientSession, registeredClient };
}
