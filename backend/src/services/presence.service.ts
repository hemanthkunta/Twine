import { WebSocket } from 'ws';
import { AuthService } from './auth.service.js';
import { WSFrame, WSPresenceUpdatePayload, WSUserTypingPayload } from '../types/protocol.js';

interface ConnectedClient {
    userId: string;
    socket: WebSocket;
    deviceId?: string;
    connectedAt: number;
}

export class PresenceService {
    // Map of userId -> Set of active WebSocket client connections (multi-device support)
    private static connections = new Map<string, Set<ConnectedClient>>();

    static registerConnection(
        userId: string,
        socket: WebSocket,
        deviceId?: string
    ): ConnectedClient {
        let userClients = this.connections.get(userId);
        if (!userClients) {
            userClients = new Set();
            this.connections.set(userId, userClients);
        }

        // Clean out any dead/closing sockets for this user
        for (const existing of Array.from(userClients)) {
            if (existing.socket.readyState !== WebSocket.OPEN) {
                userClients.delete(existing);
            }
        }

        const isFirstConnection = userClients.size === 0;

        const client: ConnectedClient = {
            userId,
            socket,
            deviceId,
            connectedAt: Date.now(),
        };

        userClients.add(client);
        AuthService.updateLastSeen(userId);

        console.log(
            `[PresenceService] REGISTERED user=${userId} device=${deviceId || 'unknown'} ` +
                `connections=${userClients.size} socketState=${socket.readyState}`
        );

        if (isFirstConnection) {
            this.broadcastPresence(userId, true);
        }

        return client;
    }

    static removeConnection(client: ConnectedClient) {
        const userClients = this.connections.get(client.userId);
        if (!userClients) return;

        userClients.delete(client);

        console.log(
            `[PresenceService] REMOVED user=${client.userId} ` +
                `device=${client.deviceId || 'unknown'} ` +
                `remaining=${userClients.size} socketState=${client.socket.readyState}`
        );

        if (userClients.size === 0) {
            this.connections.delete(client.userId);
            AuthService.updateLastSeen(client.userId);
            this.broadcastPresence(client.userId, false);
        }
    }

    static isUserOnline(userId: string): boolean {
        const clients = this.connections.get(userId);
        if (!clients) return false;
        for (const c of Array.from(clients)) {
            if (c.socket.readyState !== WebSocket.OPEN) {
                clients.delete(c);
            }
        }
        return clients.size > 0;
    }

    static getOnlineUserIds(): string[] {
        return Array.from(this.connections.keys()).filter((userId) => this.isUserOnline(userId));
    }

    static sendToUser(userId: string, frame: WSFrame) {
        const clients = this.connections.get(userId);
        if (!clients || clients.size === 0) {
            console.warn(
                `[PresenceService] sendToUser: No active client connections for user ${userId}`
            );
            return;
        }

        const data = JSON.stringify(frame);
        let sentCount = 0;
        for (const client of Array.from(clients)) {
            if (client.socket.readyState === WebSocket.OPEN) {
                client.socket.send(data);
                sentCount++;
            } else {
                clients.delete(client);
            }
        }
        if (clients.size === 0) {
            this.connections.delete(userId);
        }
        console.log(
            `[PresenceService] sendToUser: Sent frame "${frame.type}" to ${sentCount} active sockets of user ${userId}`
        );
    }

    static broadcastToUsers(userIds: string[], frame: WSFrame, exclude?: string | WebSocket) {
        const data = JSON.stringify(frame);

        for (const userId of userIds) {
            const clients = this.connections.get(userId);
            if (!clients) continue;

            for (const client of clients) {
                // Exclude a specific WebSocket connection
                if (exclude instanceof WebSocket && client.socket === exclude) {
                    continue;
                }

                // Exclude every connection belonging to a specific user
                if (typeof exclude === 'string' && client.userId === exclude) {
                    continue;
                }

                if (client.socket.readyState === WebSocket.OPEN) {
                    client.socket.send(data);
                }
            }
        }
    }

    static broadcastToAll(frame: WSFrame, excludeUserId?: string) {
        const data = JSON.stringify(frame);
        for (const [userId, clients] of this.connections.entries()) {
            if (excludeUserId && userId === excludeUserId) continue;
            for (const client of clients) {
                if (client.socket.readyState === WebSocket.OPEN) {
                    client.socket.send(data);
                }
            }
        }
    }

    static broadcastPresence(userId: string, isOnline: boolean) {
        const payload: WSPresenceUpdatePayload = {
            user_id: userId,
            is_online: isOnline,
            last_seen_at: new Date().toISOString(),
        };

        const frame: WSFrame<WSPresenceUpdatePayload> = {
            type: 'presence:update',
            payload,
            timestamp: Date.now(),
        };

        this.broadcastToAll(frame);
    }

    static broadcastTyping(
        chatId: string,
        senderId: string,
        memberIds: string[],
        isTyping: boolean
    ) {
        const sender = AuthService.getUserById(senderId);
        if (!sender) return;

        const payload: WSUserTypingPayload = {
            chat_id: chatId,
            user_id: senderId,
            username: sender.username,
            display_name: sender.display_name,
            is_typing: isTyping,
        };

        const frame: WSFrame<WSUserTypingPayload> = {
            type: 'chat:user_typing',
            payload,
            timestamp: Date.now(),
        };

        this.broadcastToUsers(memberIds, frame, senderId);
    }
}
