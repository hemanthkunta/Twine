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

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('👋 Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('👋 Server closed');
        process.exit(0);
    });
});