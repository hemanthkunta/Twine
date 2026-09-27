import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { getLogger } from './logger.service.js';
import {
    OutboxClaimedEntry,
    OutboxDeliveryResult,
    OutboxEntry,
    OutboxFrame,
    OutboxRow,
    OutboxStatus,
    OutboxTransport,
} from '../types/outbox.js';

const logger = getLogger();

const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_ERROR_LENGTH = 2000;

/** Format a Date in SQLite's datetime('now') shape: UTC 'YYYY-MM-DD HH:MM:SS'. */
function toSqliteUtc(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function envInt(name: string, fallback: number): number {
    const parsed = parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Durable outbox worker for store-and-forward delivery.
 *
 * Entries live in outbox_queue (see db/schema.ts) and move through
 * PENDING -> IN_FLIGHT -> DELIVERED, with FAILED (retry budget exhausted)
 * and EXPIRED (TTL reached) as terminal states. The worker polls on a timer,
 * claims due rows, hands each one to a registered delivery transport and
 * applies exponential backoff with jitter to failures. The transport is
 * wired in later by the WebSocket gateway via registerTransport(); nothing
 * here knows about sockets.
 */
export class OutboxService {
    private transport: OutboxTransport | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private processing = false;

    private readonly pollIntervalMs: number;
    private readonly batchSize: number;
    private readonly baseBackoffMs: number;
    private readonly maxBackoffMs: number;
    private readonly backoffJitterRatio: number;
    private readonly inFlightTimeoutMs: number;
    private readonly entryTtlMs: number;

    constructor() {
        this.pollIntervalMs = envInt('OUTBOX_POLL_INTERVAL_MS', 2000);
        this.batchSize = envInt('OUTBOX_BATCH_SIZE', 20);
        this.baseBackoffMs = envInt('OUTBOX_BASE_BACKOFF_MS', 1000);
        this.maxBackoffMs = envInt('OUTBOX_MAX_BACKOFF_MS', 60_000);
        const jitter = parseFloat(process.env.OUTBOX_BACKOFF_JITTER ?? '');
        this.backoffJitterRatio =
            Number.isFinite(jitter) && jitter >= 0 && jitter < 1 ? jitter : 0.25;
        this.inFlightTimeoutMs = envInt('OUTBOX_IN_FLIGHT_TIMEOUT_MS', 60_000);
        this.entryTtlMs = envInt('OUTBOX_TTL_MS', 7 * 24 * 60 * 60 * 1000);
    }

    /** Register the delivery transport (e.g. the WS gateway send path). */
    registerTransport(fn: OutboxTransport): void {
        this.transport = fn;
    }

    /** Insert a new PENDING entry; it becomes due immediately. */
    enqueue(entry: OutboxEntry): OutboxRow {
        if (!entry.chat_id || !entry.sender_id || !entry.recipient_user_id || !entry.temp_id) {
            throw new Error(
                'Outbox enqueue requires chat_id, sender_id, recipient_user_id and temp_id'
            );
        }
        if (!entry.frame) {
            throw new Error('Outbox enqueue requires a frame to persist for redelivery');
        }
        const id = entry.id ?? `obx_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
        db.prepare(
            `INSERT INTO outbox_queue
               (id, chat_id, sender_id, recipient_user_id, message_id, temp_id, payload_json, status, attempts, max_attempts, next_attempt_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, datetime('now'))`
        ).run(
            id,
            entry.chat_id,
            entry.sender_id,
            entry.recipient_user_id,
            entry.message_id ?? null,
            entry.temp_id,
            JSON.stringify(entry.frame),
            entry.max_attempts ?? DEFAULT_MAX_ATTEMPTS
        );
        const row = this.getEntry(id);
        if (!row) throw new Error(`Outbox entry ${id} disappeared right after insert`);
        return row;
    }

    getEntry(id: string): OutboxRow | null {
        const row = db.prepare('SELECT * FROM outbox_queue WHERE id = ?').get(id) as
            | OutboxRow
            | undefined;
        return row ?? null;
    }

    /**
     * Claim up to `limit` due PENDING rows by moving them to IN_FLIGHT.
     *
     * The pool leases a different connection per statement (round-robin), so a
     * SQL BEGIN/COMMIT cannot be used here. node:sqlite is synchronous and the
     * server is single-process, so this select -> claim -> fetch sequence
     * cannot interleave with other JavaScript: it is atomic with respect to
     * the only writer that exists. The `status = 'PENDING'` guard on the
     * update makes it a compare-and-swap regardless.
     */
    claimDue(limit: number = this.batchSize): OutboxClaimedEntry[] {
        const dueIds = db
            .prepare(
                `SELECT id FROM outbox_queue
                 WHERE status = 'PENDING' AND next_attempt_at <= datetime('now')
                 ORDER BY next_attempt_at ASC
                 LIMIT ?`
            )
            .all(Math.max(1, limit)) as Array<{ id: string }>;
        if (dueIds.length === 0) return [];

        const ids = dueIds.map((r) => r.id);
        const placeholders = ids.map(() => '?').join(', ');
        db.prepare(
            `UPDATE outbox_queue SET status = 'IN_FLIGHT', updated_at = datetime('now')
             WHERE status = 'PENDING' AND id IN (${placeholders})`
        ).run(...ids);

        const rows = db
            .prepare(`SELECT * FROM outbox_queue WHERE id IN (${placeholders})`)
            .all(...ids) as OutboxRow[];

        const claimed: OutboxClaimedEntry[] = [];
        for (const row of rows) {
            if (row.status !== 'IN_FLIGHT') continue;
            let frame: OutboxFrame;
            try {
                frame = JSON.parse(row.payload_json) as OutboxFrame;
            } catch {
                this.markFailed(row.id, 'corrupt payload_json: frame could not be parsed');
                continue;
            }
            claimed.push({ ...row, frame });
        }
        return claimed;
    }

    /** Mark an entry delivered, optionally recording the persisted message id. */
    markDelivered(id: string, messageId?: string): boolean {
        // message_id carries a FK to messages: a stale id (e.g. the message was
        // deleted while the entry sat in the queue) must not lose the delivery
        // itself, so the link is only written when the row still exists.
        let result: { changes: number };
        if (messageId && db.prepare('SELECT 1 as one FROM messages WHERE id = ?').get(messageId)) {
            result = db
                .prepare(
                    `UPDATE outbox_queue
                     SET status = 'DELIVERED', message_id = ?, updated_at = datetime('now')
                     WHERE id = ?`
                )
                .run(messageId, id);
        } else {
            result = db
                .prepare(
                    `UPDATE outbox_queue
                     SET status = 'DELIVERED', updated_at = datetime('now')
                     WHERE id = ?`
                )
                .run(id);
        }
        return result.changes > 0;
    }

    /**
     * Record a failed attempt: requeue to PENDING with exponential backoff and
     * jitter while attempts < max_attempts, otherwise stay FAILED. Stale
     * entries older than the configured TTL are expired as part of the sweep.
     */
    markFailed(id: string, error: string): OutboxStatus | null {
        const row = this.getEntry(id);
        if (!row) return null;

        const attempts = row.attempts + 1;
        const lastError = error.slice(0, MAX_ERROR_LENGTH);

        if (attempts < row.max_attempts) {
            const nextAttemptAt = toSqliteUtc(new Date(Date.now() + this.backoffDelayMs(attempts)));
            db.prepare(
                `UPDATE outbox_queue
                 SET status = 'PENDING', attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = datetime('now')
                 WHERE id = ?`
            ).run(attempts, nextAttemptAt, lastError, id);
        } else {
            db.prepare(
                `UPDATE outbox_queue
                 SET status = 'FAILED', attempts = ?, last_error = ?, updated_at = datetime('now')
                 WHERE id = ?`
            ).run(attempts, lastError, id);
        }

        this.expireStale();
        return this.getEntry(id)?.status ?? null;
    }

    /**
     * Crash recovery: requeue IN_FLIGHT rows whose claim is older than the
     * in-flight timeout. A row whose retry budget is exhausted fails instead,
     * so a crash loop cannot resurrect it forever.
     */
    recoverStuck(): { requeued: number; failed: number } {
        const cutoff = toSqliteUtc(new Date(Date.now() - this.inFlightTimeoutMs));
        const stuck = db
            .prepare(
                `SELECT id, attempts, max_attempts FROM outbox_queue
                 WHERE status = 'IN_FLIGHT' AND updated_at <= ?`
            )
            .all(cutoff) as Array<{ id: string; attempts: number; max_attempts: number }>;

        let requeued = 0;
        let failed = 0;
        for (const row of stuck) {
            const attempts = row.attempts + 1;
            if (attempts < row.max_attempts) {
                db.prepare(
                    `UPDATE outbox_queue
                     SET status = 'PENDING', attempts = ?, next_attempt_at = datetime('now'),
                         last_error = ?, updated_at = datetime('now')
                     WHERE id = ?`
                ).run(attempts, 'recovered: IN_FLIGHT claim timed out', row.id);
                requeued++;
            } else {
                db.prepare(
                    `UPDATE outbox_queue
                     SET status = 'FAILED', attempts = ?, last_error = ?, updated_at = datetime('now')
                     WHERE id = ?`
                ).run(
                    attempts,
                    'recovered: IN_FLIGHT claim timed out and retry budget was exhausted',
                    row.id
                );
                failed++;
            }
        }
        if (requeued + failed > 0) {
            logger.warn(`Outbox recovery: ${requeued} requeued, ${failed} failed (stuck IN_FLIGHT)`);
        }
        return { requeued, failed };
    }

    /** Move undelivered entries older than the TTL to EXPIRED. */
    expireStale(): number {
        const cutoff = toSqliteUtc(new Date(Date.now() - this.entryTtlMs));
        const result = db
            .prepare(
                `UPDATE outbox_queue
                 SET status = 'EXPIRED', updated_at = datetime('now')
                 WHERE status IN ('PENDING', 'IN_FLIGHT') AND created_at <= ?`
            )
            .run(cutoff);
        return result.changes;
    }

    /**
     * One worker tick: recover stuck claims, expire stale entries, claim a
     * batch and deliver each entry through the registered transport. Returns
     * the number of entries delivered in this tick.
     */
    async processDueQueue(): Promise<number> {
        const transport = this.transport;
        if (!transport || this.processing) return 0;
        this.processing = true;
        try {
            this.recoverStuck();
            this.expireStale();

            const claimed = this.claimDue(this.batchSize);
            let delivered = 0;
            for (const entry of claimed) {
                try {
                    const result: OutboxDeliveryResult = await transport(entry);
                    if (result && result.delivered) {
                        this.markDelivered(entry.id, result.message_id);
                        delivered++;
                    } else {
                        this.markFailed(
                            entry.id,
                            (result && result.error) ||
                                'transport reported the delivery as undelivered'
                        );
                    }
                } catch (err) {
                    this.markFailed(entry.id, err instanceof Error ? err.message : String(err));
                }
            }
            return delivered;
        } catch (err) {
            logger.error({
                msg: 'Outbox worker tick failed',
                err: err instanceof Error ? err.message : String(err),
            });
            return 0;
        } finally {
            this.processing = false;
        }
    }

    /** Start the polling worker. Idempotent: a second call is a no-op. */
    start(): void {
        if (this.timer) return;
        this.timer = setInterval(() => {
            void this.processDueQueue();
        }, this.pollIntervalMs);
        this.timer.unref?.();
        logger.info(
            `Outbox worker started (interval: ${this.pollIntervalMs}ms, batch: ${this.batchSize})`
        );
        void this.processDueQueue();
    }

    /** Stop the polling worker. Idempotent; safe to call before start(). */
    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            logger.info('Outbox worker stopped');
        }
    }

    /** Row counts per status, for dashboards and integration checks. */
    getQueueStats(): Record<OutboxStatus, number> {
        const rows = db
            .prepare('SELECT status, COUNT(*) as count FROM outbox_queue GROUP BY status')
            .all() as Array<{ status: OutboxStatus; count: number }>;
        const stats: Record<OutboxStatus, number> = {
            PENDING: 0,
            IN_FLIGHT: 0,
            DELIVERED: 0,
            FAILED: 0,
            EXPIRED: 0,
        };
        for (const row of rows) {
            if (row.status in stats) stats[row.status] = row.count;
        }
        return stats;
    }

    /** Exponential backoff with additive jitter: base * 2^(attempts-1), capped. */
    private backoffDelayMs(attempts: number): number {
        const exponential = Math.min(
            this.baseBackoffMs * 2 ** Math.max(attempts - 1, 0),
            this.maxBackoffMs
        );
        const jitter = exponential * this.backoffJitterRatio * Math.random();
        return Math.round(exponential + jitter);
    }
}

/** Shared singleton: the gateway wires its transport into this instance. */
export const outboxService = new OutboxService();
