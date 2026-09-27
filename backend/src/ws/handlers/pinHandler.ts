import { WebSocket } from 'ws';
import { ChatService } from '../../services/chat.service.js';
import { GroupService } from '../../services/group.service.js';
import { MessageService } from '../../services/message.service.js';
import { PresenceService } from '../../services/presence.service.js';
import { ConnectedClient } from '../../services/presence.service.js';
import { WSPinMessagePayload } from '../../types/protocol.js';

export async function handlePinMessage(
    socket: WebSocket,
    payload: WSPinMessagePayload,
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

    const pinPayload = payload;

    if (!clientSession) {
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    if (
        !pinPayload.chat_id ||
        !ChatService.isChatMember(pinPayload.chat_id, clientSession.userId)
    ) {
        sendError('FORBIDDEN', 'You are not a member of this chat');
        return { clientSession, registeredClient };
    }

    if (pinPayload.is_pinned) {
        GroupService.pinMessage(
            pinPayload.chat_id,
            pinPayload.message_id,
            clientSession.userId
        );
    } else {
        GroupService.unpinMessage(pinPayload.chat_id);
    }

    const memberIds = ChatService.getChatMemberIds(pinPayload.chat_id);
    // Must be awaited: getMessageById is async, and an un-awaited promise
    // serialises to {} in the broadcast frame below.
    const pinnedMsg = pinPayload.is_pinned
        ? await MessageService.getMessageById(pinPayload.message_id)
        : null;

    const frame = {
        type: 'chat:message_pinned',
        payload: { chat_id: pinPayload.chat_id, pinned_message: pinnedMsg },
        timestamp: Date.now(),
    };

    PresenceService.broadcastToUsers(memberIds, frame);

    return { clientSession, registeredClient };
}