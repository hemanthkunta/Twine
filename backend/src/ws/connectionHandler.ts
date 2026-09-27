import { WebSocket, RawData } from 'ws';
import { MetricsService } from '../services/metrics.service.js';
import { ConnectedClient, PresenceService } from '../services/presence.service.js';
import {
    checkNewConnectionRate,
    getConnectionCount,
    incrementConnectionCount,
    decrementConnectionCount,
    MAX_CONCURRENT_CONNECTIONS_PER_IP,
} from './rateLimiter.js';
import { handleMessage } from './messageHandler.js';

export function handleConnection(socket: WebSocket) {
    const ip =
        (socket as WebSocket & { _socket?: { remoteAddress?: string } })._socket?.remoteAddress ||
        '127.0.0.1';

    // Check rate limits: new connection rate and concurrent connections
    if (
        !checkNewConnectionRate(ip) ||
        getConnectionCount(ip) >= MAX_CONCURRENT_CONNECTIONS_PER_IP
    ) {
        // Send error and close
        const sendError = (code: string, message: string) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(
                    JSON.stringify({
                        type: 'error',
                        payload: { code, message },
                    })
                );
            }
        };
        sendError(
            'TOO_MANY_CONNECTIONS',
            'Too many WebSocket connections from this IP. Please try again later.'
        );
        socket.close(4000, 'Too many connections');
        return;
    }
    incrementConnectionCount(ip);

    MetricsService.incrementWsConnections();

    let clientSession: { userId: string; deviceId?: string } | null = null;
    let registeredClient: ConnectedClient | null = null;

    socket.on('message', async (raw: RawData) => {
        MetricsService.recordWsMessageReceived();
        try {
            const result = await handleMessage(
                socket,
                raw.toString(),
                clientSession,
                registeredClient,
                ip
            );
            clientSession = result.clientSession;
            registeredClient = result.registeredClient;
        } catch (err) {
            // handleMessage should not throw, but just in case
            console.error('Error in handleMessage:', err);
        }
    });

    socket.on('close', (code: number, reason: Buffer) => {
        console.warn(
            `[WebSocket] CLOSED user=${clientSession?.userId || 'unauthenticated'} ` +
                `code=${code} reason=${reason.toString()}`
        );

        MetricsService.decrementWsConnections();

        if (registeredClient) {
            PresenceService.removeConnection(registeredClient);
            registeredClient = null;
        }
        decrementConnectionCount(ip);
    });

    socket.on('error', (err: Error) => {
        console.error(`[WebSocket] ERROR user=${clientSession?.userId || 'unauthenticated'}:`, err);

        MetricsService.decrementWsConnections();

        if (registeredClient) {
            PresenceService.removeConnection(registeredClient);
            registeredClient = null;
        }
    });
}
