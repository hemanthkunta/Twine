import { WebSocket } from 'ws';
import { ChatService } from '../../services/chat.service.js';
import { MessageService } from '../../services/message.service.js';
import { PresenceService, ConnectedClient } from '../../services/presence.service.js';
import { BlockService } from '../../services/block.service.js';
import { AIService } from '../../services/ai.service.js';
import {
    WSSendMessagePayload,
    WSMessageAckPayload,
    WSReceiptUpdatePayload,
} from '../../types/protocol.js';

export async function handleSendMessage(
    socket: WebSocket,
    payload: WSSendMessagePayload,
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

    // Every other handler rejects unauthenticated frames explicitly; without
    // this guard the membership check below would dereference a null session.
    if (!clientSession) {
        sendError('UNAUTHENTICATED', 'Must complete auth:handshake first');
        return { clientSession, registeredClient };
    }

    const msgPayload = payload;

    if (!msgPayload.chat_id) {
        sendError('INVALID_PAYLOAD', 'chat_id is required');
        return { clientSession, registeredClient };
    }

    // Authorization: sender must be allowed to send in the target chat.
    if (!await ChatService.isAllowedToSend(msgPayload.chat_id, clientSession.userId)) {
        sendError('FORBIDDEN', 'You are not allowed to send messages in this chat');
        return { clientSession, registeredClient };
    }

    const memberIds = ChatService.getChatMemberIds(msgPayload.chat_id);
    const peerId = memberIds.find((id) => id !== clientSession.userId);

    // Block check: verify if sender or recipient has blocked the other
    if (peerId && BlockService.isBlocked(clientSession.userId, peerId)) {
        sendError('BLOCKED', 'Message cannot be delivered due to blocking');
        return { clientSession, registeredClient };
    }

    const message = await MessageService.createMessage({
        chatId: msgPayload.chat_id,
        senderId: clientSession.userId,
        contentText: msgPayload.content || '',
        type: msgPayload.type || 'TEXT',
        replyToMessageId: msgPayload.reply_to_id,
        ciphertextPayload: msgPayload.ciphertext_payload,
        mediaUrl: msgPayload.media_url,
        mediaMetadata: msgPayload.media_metadata,
    });

    // Record delivery for every online peer *before* the frame is built. Doing it
    // after broadcast meant chat:new_message shipped a stale `SENT` status, so the
    // recipient (and the sender's other devices) rendered the wrong tick state.
    const deliveredTo: string[] = [];
    for (const memberId of memberIds) {
        if (memberId !== clientSession.userId && PresenceService.isUserOnline(memberId)) {
            MessageService.updateReceipt(message.id, memberId, 'DELIVERED');
            deliveredTo.push(memberId);
        }
    }
    if (deliveredTo.length > 0) {
        message.status = 'DELIVERED';
    }

    // Acknowledge back to sender
    const ack: WSMessageAckPayload = {
        temp_id: msgPayload.temp_id,
        message_id: message.id,
        chat_id: message.chat_id,
        created_at: message.created_at,
        status: message.status,
    };
    sendFrame('chat:message_ack', ack);

    // Broadcast to chat members (excluding this specific socket, sending to all other sockets including other devices of the sender)
    const newMsgFrame = {
        type: 'chat:new_message',
        payload: { message, chat_id: message.chat_id },
        timestamp: Date.now(),
    };

    PresenceService.broadcastToUsers(memberIds, newMsgFrame, socket);

    // Tell the sender (every device they are signed in on, not just this socket)
    // that the message reached an online peer.
    for (const memberId of deliveredTo) {
        const receiptPayload: WSReceiptUpdatePayload = {
            chat_id: message.chat_id,
            message_id: message.id,
            user_id: memberId,
            status: 'DELIVERED',
            timestamp: new Date().toISOString(),
        };
        PresenceService.broadcastToUsers([clientSession.userId], {
            type: 'chat:receipt_update',
            payload: receiptPayload,
            timestamp: Date.now(),
        });
    }

    // 🤖 Check for AI Bot trigger (@ai or Direct AI Chat)
    const isDirectAIChat = memberIds.includes('usr_ai_bot');
    const text = message.content_text || '';
    const hasAITrigger = text.trim().toLowerCase().startsWith('@ai');

    if (isDirectAIChat || hasAITrigger) {
        setTimeout(() => {
            // Send typing indicator from AI bot
            PresenceService.broadcastTyping(message.chat_id, 'usr_ai_bot', memberIds, true);

            setTimeout(async () => {
                PresenceService.broadcastTyping(
                    message.chat_id,
                    'usr_ai_bot',
                    memberIds,
                    false
                );
                try {
                    const cleanPrompt = text.replace(/^@ai\s*/i, '');
                    const history = await MessageService.getChatMessages(message.chat_id, 10);
                    const botReplyText = AIService.generateBotResponse(cleanPrompt, history);

                    const botMessage = await MessageService.createMessage({
                        chatId: message.chat_id,
                        senderId: 'usr_ai_bot',
                        contentText: botReplyText,
                        type: 'TEXT',
                        replyToMessageId: message.id,
                    });

                    const botFrame = {
                        type: 'chat:new_message',
                        payload: { message: botMessage, chat_id: message.chat_id },
                        timestamp: Date.now(),
                    };
                    PresenceService.broadcastToUsers(memberIds, botFrame);
                } catch (err) {
                    console.error('Failed to generate AI bot message:', err);
                }
            }, 1200);
        }, 400);
    }

    // Note: clientSession and registeredClient are unchanged in this handler
    return { clientSession, registeredClient };
}
