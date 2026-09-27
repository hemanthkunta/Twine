/**
 * Types for the durable outbox (store-and-forward delivery) and per-device
 * sync cursors.
 *
 * Deliberately kept separate from protocol.ts, which is owned by the
 * WebSocket layer: the outbox is a server-side persistence concern. OutboxFrame
 * mirrors the WSFrame envelope shape locally so this module never has to
 * import it, and the wire protocol file stays untouched.
 */

export type OutboxStatus = 'PENDING' | 'IN_FLIGHT' | 'DELIVERED' | 'FAILED' | 'EXPIRED';

/** Envelope serialized into outbox_queue.payload_json for redelivery. */
export interface OutboxFrame {
    seq?: number;
    type: string;
    payload: unknown;
    correlation_id?: string;
    timestamp: number;
}

/** Input accepted by OutboxService.enqueue(). */
export interface OutboxEntry {
    id?: string;
    chat_id: string;
    sender_id: string;
    recipient_user_id: string;
    temp_id: string;
    message_id?: string | null;
    frame: OutboxFrame;
    max_attempts?: number;
}

/** Row shape as stored in the outbox_queue table. */
export interface OutboxRow {
    id: string;
    chat_id: string;
    sender_id: string;
    recipient_user_id: string;
    message_id: string | null;
    temp_id: string;
    payload_json: string;
    status: OutboxStatus;
    attempts: number;
    max_attempts: number;
    next_attempt_at: string;
    last_error: string | null;
    created_at: string;
    updated_at: string;
}

/** A claimed (IN_FLIGHT) row with payload_json parsed back into a frame. */
export interface OutboxClaimedEntry extends OutboxRow {
    frame: OutboxFrame;
}

/** What a registered transport reports after one attempted delivery. */
export interface OutboxDeliveryResult {
    delivered: boolean;
    message_id?: string;
    error?: string;
}

/**
 * Delivery transport: called by the worker with one claimed entry. Resolving
 * with the delivery outcome is the contract; rejecting is treated as a
 * failed attempt and goes through the normal backoff path.
 */
export type OutboxTransport = (
    entry: OutboxClaimedEntry
) => OutboxDeliveryResult | Promise<OutboxDeliveryResult>;

/** Per-device offline catch-up cursor (device_sync_state table). */
export interface DeviceSyncState {
    id: string;
    user_id: string;
    device_id: string;
    last_acked_seq: number;
    last_delivered_message_id: string | null;
    updated_at: string;
}
