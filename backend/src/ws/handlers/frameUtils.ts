import { WebSocket } from 'ws';
import { WSFrame } from '../../types/protocol.js';

/**
 * Safely send a WSFrame over a WebSocket connection.
 * Handles the race condition where socket closes between readyState check and send.
 */
export function safeSend(socket: WebSocket, frame: WSFrame): boolean {
    if (socket.readyState !== WebSocket.OPEN) {
        return false;
    }
    try {
        socket.send(JSON.stringify(frame));
        return true;
    } catch (err) {
        // Socket closed between readyState check and send
        console.warn(
            `[FrameUtils] safeSend: Failed to send "${frame.type}" (socket closed):`,
            err instanceof Error ? err.message : String(err)
        );
        return false;
    }
}

/**
 * Create a standard WSFrame.
 */
export function createFrame<T>(type: string, payload: T, correlationId?: string): WSFrame<T> {
    return {
        type,
        payload,
        correlation_id: correlationId,
        timestamp: Date.now(),
    };
}