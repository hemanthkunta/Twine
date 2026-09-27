import { SignalProtocolService } from '../../services/signalProtocol.service.js';
import { KeyDirectoryService } from '../../services/keyDirectory.service.js';
import { BaseService } from '../../services/base.service.js';
import { MetricsService } from '../../services/metrics.service.js';
import { WebSocket } from 'ws';
import {
    WSRequestPreKeyBundlePayload,
    WSPreKeyBundlePayload,
} from '../../types/protocol.js';

/**
 * Handle request for a user's prekey bundle (for X3DH handshake)
 * This is used when a user wants to initiate an E2E encrypted conversation with another user
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
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type: 'error',
                    payload: { code, message },
                    correlation_id: correlationId,
                    timestamp: Date.now(),
                })
            );
        }
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

        // Prevent users from requesting their own prekey bundle (they should generate it client-side)
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

        // Generate prekey bundle for the target user
        // Note: In a true E2E implementation, this would be done client-side
        // For now, we're providing a server-assisted implementation for demonstration
        const preKeyBundle = await SignalProtocolService.generatePreKeyBundle(targetUserId);

        // Send the prekey bundle back to the requester
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type: 'key:prekey_bundle',
                    payload: preKeyBundle,
                    correlation_id: correlation_id,
                    timestamp: Date.now(),
                })
            );
        }

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
 * This allows users to exchange prekey bundles to establish sessions
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
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type: 'error',
                    payload: { code, message },
                    correlation_id: correlationId,
                    timestamp: Date.now(),
                })
            );
        }
    };

    try {
        // Authenticate the recipient
        if (!clientSession?.userId) {
            sendError('UNAUTHORIZED', 'Not authenticated', correlation_id);
            return { clientSession, registeredClient };
        }

        const recipientId = clientSession.userId;
        const {
            user_id: senderId,
            registration_id,
            device_id,
            pre_key_id,
            pre_key_public,
            signed_pre_key_id,
            signed_pre_key_public,
            signed_pre_key_signature,
            identity_key
        } = payload as WSPreKeyBundlePayload;

        // Validate required fields
        if (!senderId || !registration_id || !device_id || !pre_key_id ||
            !pre_key_public || !signed_pre_key_id || !signed_pre_key_public ||
            !signed_pre_key_signature || !identity_key) {
            sendError('BAD_REQUEST', 'Missing required prekey bundle fields', correlation_id);
            return { clientSession, registeredClient };
        }

        // Process the prekey bundle to create a session
        await SignalProtocolService.processPreKeyBundle(
            recipientId,      // recipient (current user)
            senderId,         // sender (the user who sent the bundle)
            registration_id,
            device_id,
            pre_key_id,
            identity_key,
            signed_pre_key_id,
            signed_pre_key_public,
            signed_pre_key_signature,
            pre_key_public
        );

        // Send acknowledgment (optional)
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(
                JSON.stringify({
                    type: 'key:prekey_bundle_ack',
                    payload: { status: 'processed' },
                    correlation_id: correlation_id,
                    timestamp: Date.now(),
                })
            );
        }

        MetricsService.recordWsMessageSent();
        return { clientSession, registeredClient };
    } catch (err) {
        console.error('Error in handlePreKeyBundle:', err);
        const message = err instanceof Error ? err.message : 'Server error processing packet';
        sendError('INTERNAL_ERROR', message, correlation_id);
        return { clientSession, registeredClient };
    }
}