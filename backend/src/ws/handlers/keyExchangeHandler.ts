import { BaseService } from '../../services/base.service.js';
import { MetricsService } from '../../services/metrics.service.js';
import { WebSocket } from 'ws';
import {
    WSRequestPreKeyBundlePayload,
    WSPreKeyBundlePayload,
} from '../../types/protocol.js';
import { safeSend, createFrame } from './frameUtils.js';

/**
 * Handle request for a user's prekey bundle (for X3DH handshake)
 * DEPRECATED: Server-side bundle generation is removed for E2EE security.
 * Clients MUST generate bundles client-side and publish via REST /keys/bundle.
 * This handler returns an error directing clients to the REST API.
 */
export async function handleRequestPreKeyBundle(
    socket: WebSocket,
    payload: any,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: any | null,
    correlation_id: string
): Promise<{
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: any | null;
}> {
    // Send error response helper
    const sendError = (code: string, message: string, correlationId?: string) => {
        safeSend(socket, createFrame('error', { code, message }, correlationId));
    };

    try {
        // Authenticate the requester
        if (!clientSession?.userId) {
            sendError('UNAUTHORIZED', 'Not authenticated', correlation_id);
            return { clientSession, registeredClient };
        }

        const requesterId = clientSession.userId;
        const { user_id: targetUserId } = payload as WSRequestPreKeyBundlePayload;

        // Validate target user ID
        if (!targetUserId || typeof targetUserId !== 'string') {
            sendError('BAD_REQUEST', 'Invalid or missing user_id', correlation_id);
            return { clientSession, registeredClient };
        }

        // Prevent users from requesting their own prekey bundle
        if (targetUserId === requesterId) {
            sendError('BAD_REQUEST', 'Cannot request own prekey bundle', correlation_id);
            return { clientSession, registeredClient };
        }

        // Check if target user exists
        const targetUser = BaseService.queryOne(
            'SELECT id FROM users WHERE id = ?',
            [targetUserId]
        );

        if (!targetUser) {
            sendError('NOT_FOUND', 'User not found', correlation_id);
            return { clientSession, registeredClient };
        }

        // DEPRECATED: Server-side pre-key bundle generation is removed.
        // Clients MUST generate their own bundles client-side using libsignal
        // and publish via POST /keys/bundle. Retrieve bundles via GET /keys/bundle/:userId.
        sendError('DEPRECATED', 'WebSocket pre-key bundle request is deprecated. Use REST API: POST /keys/bundle to publish, GET /keys/bundle/:userId to retrieve.', correlation_id);

        MetricsService.recordWsMessageSent();
        return { clientSession, registeredClient };
    } catch (err) {
        console.error('Error in handleRequestPreKeyBundle:', err);
        const message = err instanceof Error ? err.message : 'Server error processing packet';
        sendError('INTERNAL_ERROR', message, correlation_id);
        return { clientSession, registeredClient };
    }
}

/**
 * Handle receiving a prekey bundle (typically sent after a request)
 * DEPRECATED: Server-side session creation from WebSocket bundles is removed for E2EE security.
 * Clients MUST publish bundles via REST POST /keys/bundle and retrieve via GET /keys/bundle/:userId.
 * Session establishment happens client-side using libsignal.
 */
export async function handlePreKeyBundle(
    socket: WebSocket,
    payload: any,
    clientSession: { userId: string; deviceId?: string } | null,
    registeredClient: any | null,
    correlation_id: string
): Promise<{
    clientSession: { userId: string; deviceId?: string } | null;
    registeredClient: any | null;
}> {
    // Send error response helper
    const sendError = (code: string, message: string, correlationId?: string) => {
        safeSend(socket, createFrame('error', { code, message }, correlationId));
    };

    try {
        // Authenticate the recipient
        if (!clientSession?.userId) {
            sendError('UNAUTHORIZED', 'Not authenticated', correlation_id);
            return { clientSession, registeredClient };
        }

        // DEPRECATED: Server-side session creation from WebSocket bundles is removed.
        // Clients MUST generate bundles client-side and publish via REST POST /keys/bundle.
        // Retrieve bundles via REST GET /keys/bundle/:userId.
        // Session establishment (X3DH + Double Ratchet) happens entirely client-side.
        sendError('DEPRECATED', 'WebSocket pre-key bundle submission is deprecated. Use REST API: POST /keys/bundle to publish, GET /keys/bundle/:userId to retrieve. Sessions are established client-side.', correlation_id);

        MetricsService.recordWsMessageSent();
        return { clientSession, registeredClient };
    } catch (err) {
        console.error('Error in handlePreKeyBundle:', err);
        const message = err instanceof Error ? err.message : 'Server error processing packet';
        sendError('INTERNAL_ERROR', message, correlation_id);
        return { clientSession, registeredClient };
    }
}