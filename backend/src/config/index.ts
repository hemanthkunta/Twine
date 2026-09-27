import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getLogger } from '../services/logger.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up three levels: backend/src/config -> backend/src -> backend -> messagingproject
const projectRoot = path.resolve(__dirname, '../../../');
const logger = getLogger();
logger.debug('[config] projectRoot: %s', projectRoot);
logger.debug('[config] DB_PATH env: %s', process.env.DB_PATH);

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// 1. JWT Secret Validation & Ephemeral Generation
let jwtSecret = process.env.JWT_SECRET;
if (isProduction) {
    if (!jwtSecret || jwtSecret.includes('development') || jwtSecret.length < 32) {
        throw new Error('FATAL: JWT_SECRET must be configured with at least 32 characters in production');
    }
} else if (!jwtSecret) {
    jwtSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️ [DEV WARNING] JWT_SECRET is unset. Generated in-memory ephemeral secret for this session.');
}

// 2. TURN Shared Secret Validation & Ephemeral Generation
let turnSharedSecret = process.env.TURN_SHARED_SECRET;
if (isProduction) {
    if (!turnSharedSecret || turnSharedSecret.length < 16) {
        throw new Error('FATAL: TURN_SHARED_SECRET must be configured with at least 16 characters in production for Coturn HMAC-SHA1 auth');
    }
} else if (!turnSharedSecret) {
    turnSharedSecret = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️ [DEV WARNING] TURN_SHARED_SECRET is unset. Generated in-memory ephemeral secret for this session.');
}

// 3. TURN Server URLs Validation
let turnUrls: string[];
if (process.env.TURN_URLS) {
    turnUrls = process.env.TURN_URLS.split(',').map((s) => s.trim());
} else if (isProduction) {
    throw new Error('FATAL: TURN_URLS must be configured in production (e.g. "turn:turn.yourdomain.com:3478,turns:turn.yourdomain.com:5349")');
} else {
    // Development default: empty array (STUN-only) unless explicitly configured
    turnUrls = [];
}

// Resolve database path
const dbPath = process.env.DB_PATH || path.join(projectRoot, 'messaging.db');
logger.debug('[config] Resolved dbPath: %s', dbPath);

export const config = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv,
    isProduction,
    jwtSecret,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    dbPath,
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '30d',
    redisHost: process.env.REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.REDIS_PORT || '6379', 10),
    redisPassword: process.env.REDIS_PASSWORD || undefined,
    redisDb: parseInt(process.env.REDIS_DB || '0', 10),
    logLevel: process.env.LOG_LEVEL || 'info',

    // Server-side-only TURN time-limited credential generation config
    // ⚠️ TURN_SHARED_SECRET is never exposed to the frontend/client
    turnSharedSecret,
    turnUrls,
    turnTtl: parseInt(process.env.TURN_TTL || '3600', 10),

    // Managed Provider Config (Optional alternative to Coturn)
    meteredApiKey: process.env.METERED_API_KEY,
    meteredAppName: process.env.METERED_APP_NAME,
};
