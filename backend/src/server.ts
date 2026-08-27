import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { initDatabase, db } from './db/index.js';
import { router } from './http/routes.js';
import { setupWebSocketGateway } from './ws/gateway.js';
import { UPLOADS_DIR } from './services/media.service.js';

// Initialize Database & seed data
initDatabase();

const app = express();

// Middleware
const allowedOrigins = [
    config.corsOrigin,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. mobile apps, curl) or allowed origins
            if (!origin || allowedOrigins.includes(origin) || !config.isProduction) {
                callback(null, true);
            } else {
                callback(new Error('Blocked by CORS policy'));
            }
        },
        credentials: true,
    })
);

// Bounded payload limits for base64 media uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static media uploads serving with nosniff header
app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
        setHeaders: (res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        },
    })
);

// Mount API routes
app.use('/api', router);

// Mount Frontend Client build if present (for production Docker containers)
const publicDir = path.resolve(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/ws')) {
            return next();
        }
        res.sendFile(path.join(publicDir, 'index.html'));
    });
}

// Create HTTP Server & attach WebSocket Gateway
const server = http.createServer(app);
const wss = setupWebSocketGateway(server);

// Start listening
server.listen(config.port, () => {
    console.log(`
  ======================================================
  🚀 Aether Full-Stack Messaging Platform Backend
  ------------------------------------------------------
  📡 HTTP API:      http://localhost:${config.port}/api
  ⚡ WebSocket:     ws://localhost:${config.port}/ws
  📁 Media Uploads: http://localhost:${config.port}/uploads
  🩺 Health Check:  http://localhost:${config.port}/api/health
  📊 Metrics:       http://localhost:${config.port}/api/metrics
  ======================================================
  `);
});

// Graceful Shutdown Handler (Drains connections on SIGTERM / SIGINT)
const gracefulShutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop accepting new HTTP connections
    server.close(() => {
        console.log('  ✓ HTTP server closed.');

        // 2. Close database connection
        try {
            db.close();
            console.log('  ✓ SQLite database connection closed.');
        } catch (e) {
            console.error('  Error closing database:', e);
        }

        console.log('  ✓ Graceful shutdown complete. Process exiting.');
        process.exit(0);
    });

    // Force exit if draining exceeds 10 seconds
    setTimeout(() => {
        console.error('  ⚠️ Graceful shutdown timed out. Forcing process exit.');
        process.exit(1);
    }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
