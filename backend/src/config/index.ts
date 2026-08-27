import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && (!jwtSecret || jwtSecret.includes('development') || jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
}

export const config = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv,
    isProduction,

    // Development gets an ephemeral secret.
    // Production MUST provide strong JWT_SECRET.
    jwtSecret: jwtSecret || 'development-only-ephemeral-secret-change-me',

    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

    dbPath: process.env.DB_PATH || path.join(projectRoot, 'messaging.db'),

    // Short-lived access token.
    accessTokenExpiresIn: '15m',

    refreshTokenExpiresIn: '30d',
};
