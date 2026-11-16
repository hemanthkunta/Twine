// Bounded payload limits for base64 media uploads
import express from 'express';
import cors from 'cors';
import { router } from './http/routes.js';
import { config } from './config/index.js';
import { db } from './db/index.js';
import { initDatabase } from './db/index.js';
import { setupWebSocketGateway } from './ws/gateway.js';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DashboardEventService } from './services/dashboardEventService.js';
import { ScheduledMessageService } from './services/scheduledMessage.service.js';
import { PresenceService } from './services/presence.service.js';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database
initDatabase();

// Create Express app
const app = express();

// Bounded payload limits for base64 media uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// CORS configuration honoring config.corsOrigin
app.use(
    cors({
        origin: config.corsOrigin,
    })
);

// Mount API routes
app.use('/api', router);

// Mount Frontend Client build if present (for production Docker containers)
const publicDir = resolve(process.cwd(), 'public');
if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/ws')) {
            return next();
        }
        res.sendFile(join(publicDir, 'index.html'));
    });
}

// Start server
const server = app.listen(config.port, () => {
    console.log(`🚀 Server running on http://localhost:${config.port}`);

    // Emit dashboard event for server started
    DashboardEventService.emitDashboardMetricsUpdate({
        event: 'server_started',
        port: config.port,
        timestamp: new Date().toISOString()
    });
});

setupWebSocketGateway(server);

// Background sweeps (self-rescheduling to avoid starvation under load):
//  * dispatchDue: delivers scheduled_messages whose time has come through the
//    normal send path (receipts + chat:new_message fanout).
//  * deleteExpiredMessages: enforces per-chat disappearing TTLs by hard-deleting
//    messages past expires_at and broadcasting chat:messages_deleted (batched).
const SWEEP_INTERVAL_MS = 15_000;
let sweepTimeout: NodeJS.Timeout | null = null;

// Periodic cleanup for dead WebSocket connections (every 30s)
const WS_CLEANUP_INTERVAL_MS = 30_000;
let wsCleanupTimeout: NodeJS.Timeout | null = null;

function runWsCleanup(): void {
    const cleaned = PresenceService.cleanupDeadConnections();
    if (cleaned > 0) {
        console.log(`[WS Cleanup] removed ${cleaned} dead connections`);
    }
    wsCleanupTimeout = setTimeout(runWsCleanup, WS_CLEANUP_INTERVAL_MS);
    wsCleanupTimeout.unref();
}

function runSweep(): void {
    const start = Date.now();
    ScheduledMessageService.dispatchDue().catch((err) =>
        console.error('[Scheduled Sweep]', err)
    );
    try {
        const removed = ScheduledMessageService.deleteExpiredMessages();
        if (removed > 0) {
            console.log(`[TTL Sweep] removed ${removed} expired message(s)`);
        }
    } catch (err) {
        console.error('[TTL Sweep]', err);
    }
    const elapsed = Date.now() - start;
    const nextDelay = Math.max(100, SWEEP_INTERVAL_MS - elapsed); // yield if overrun
    sweepTimeout = setTimeout(runSweep, nextDelay);
    sweepTimeout.unref(); // Don't keep process alive for sweep
}

runSweep(); // Start the first sweep
runWsCleanup(); // Start the first WS cleanup

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    if (sweepTimeout) clearTimeout(sweepTimeout);
    if (wsCleanupTimeout) clearTimeout(wsCleanupTimeout);
    server.close(() => {
        console.log('👋 Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    if (sweepTimeout) clearTimeout(sweepTimeout);
    if (wsCleanupTimeout) clearTimeout(wsCleanupTimeout);
    server.close(() => {
        console.log('👋 Server closed');
        process.exit(0);
    });
});