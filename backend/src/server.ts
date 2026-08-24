import http from 'node:http';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { initDatabase, db } from './db/index.js';
import { router } from './http/routes.js';
import { setupWebSocketGateway } from './ws/gateway.js';

// Initialize Database & seed data
initDatabase();

const app = express();

// Middleware
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);
// Bounded payload limits for base64 media uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static file uploads directory
app.use('/uploads', express.static(path.resolve('uploads')));

// Mount API routes
app.use('/api', router);

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
