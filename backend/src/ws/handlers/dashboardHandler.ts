import { WebSocket } from 'ws';
import { ConnectedClient } from '../../services/presence.service.js';

// Set to hold dashboard WebSocket connections
const dashboardClients = new Set<WebSocket>();

/**
 * Broadcast an event to all connected dashboard clients
 * @param type - The event type
 * @param payload - The event payload
 * @param correlationId - Optional correlation ID
 */
export function broadcastDashboardEvent(type: string, payload: unknown, correlationId?: string): void {
    const sendFrame = (socket: WebSocket) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type,
                payload,
                correlation_id: correlationId,
                timestamp: Date.now(),
            }));
        }
    };

    dashboardClients.forEach(sendFrame);
}

/**
 * Handle dashboard connection registration
 * @param socket - The WebSocket connection
 * @param payload - The message payload (expected to be empty or optional data)
 * @param clientSession - The client session (null for unauthenticated)
 * @param registeredClient - The registered client (null for unauthenticated)
 * @param correlationId - The correlation ID
 * @returns Updated clientSession and registeredClient
 */
export function handleDashboardConnect(
    socket: WebSocket,
    payload: any,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): { clientSession: { userId: string; deviceId?: string } | null; registeredClient: ConnectedClient | null } {
    const sendFrame = (type: string, payloadObj: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type,
                payload: payloadObj,
                correlation_id: correlationId,
                timestamp: Date.now(),
            }));
        }
    };

    const sendError = (code: string, message: string) => {
        sendFrame('error', { code, message });
    };

    // Register this socket as a dashboard client
    dashboardClients.add(socket);

    // Automatically unregister when the socket closes
    const onClose = () => {
        dashboardClients.delete(socket);
        socket.off('close', onClose);
        socket.off('error', onClose);
    };
    socket.on('close', onClose);
    socket.on('error', onClose);

    // Acknowledge the connection
    sendFrame('dashboard:connected', { timestamp: Date.now() });

    return { clientSession, registeredClient };
}

/**
 * Handle dashboard disconnection
 * @param socket - The WebSocket connection
 * @param payload - The message payload
 * @param clientSession - The client session (null for unauthenticated)
 * @param registeredClient - The registered client (null for unauthenticated)
 * @param correlationId - The correlation ID
 * @returns Updated clientSession and registeredClient
 */
export function handleDashboardDisconnect(
    socket: WebSocket,
    payload: any,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): { clientSession: { userId: string; deviceId?: string } | null; registeredClient: ConnectedClient | null } {
    const sendFrame = (type: string, payloadObj: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type,
                payload: payloadObj,
                correlation_id: correlationId,
                timestamp: Date.now(),
            }));
        }
    };

    const sendError = (code: string, message: string) => {
        sendFrame('error', { code, message });
    };

    // Unregister this socket
    dashboardClients.delete(socket);
    sendFrame('dashboard:disconnected', { timestamp: Date.now() });
    return { clientSession, registeredClient };
}

/**
 * Handle dashboard ping
 * @param socket - The WebSocket connection
 * @param payload - The message payload
 * @param clientSession - The client session (null for unauthenticated)
 * @param registeredClient - The registered client (null for unauthenticated)
 * @param correlationId - The correlation ID
 * @returns Updated clientSession and registeredClient
 */
export function handleDashboardPing(
    socket: WebSocket,
    payload: any,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: ConnectedClient | null,
    correlationId: string
): { clientSession: { userId: string; deviceId?: string } | null; registeredClient: ConnectedClient | null } {
    const sendFrame = (type: string, payloadObj: unknown) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type,
                payload: payloadObj,
                correlation_id: correlationId,
                timestamp: Date.now(),
            }));
        }
    };

    const sendError = (code: string, message: string) => {
        sendFrame('error', { code, message });
    };

    // Respond with a pong
    sendFrame('dashboard:pong', { timestamp: Date.now() });
    return { clientSession, registeredClient };
}