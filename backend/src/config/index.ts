import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
}

export const config = {
    port: parseInt(process.env.PORT || '4000', 10),

    // Development gets an ephemeral secret.
    // Production MUST provide JWT_SECRET.
    jwtSecret: jwtSecret || 'development-only-ephemeral-secret-change-me',

    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

    dbPath: process.env.DB_PATH || path.join(projectRoot, 'messaging.db'),

    // Short-lived access token.
    accessTokenExpiresIn: '15m',

    // Refresh tokens will be implemented in the next step.
    refreshTokenExpiresIn: '30d',
};
