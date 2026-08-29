import crypto from 'node:crypto';
import { config } from '../config/index.js';

export interface TurnCredentialResponse {
    urls: string[];
    username: string;
    credential: string;
    ttl: number;
}

/**
 * TURN Time-Limited Ephemeral Credential Service
 * 
 * Mode A: Self-Hosted Coturn (HMAC-SHA1 Shared Secret Scheme)
 * -------------------------------------------------------------
 * Coturn turnserver.conf must have:
 *   use-auth-secret
 *   static-auth-secret=<exact same string as process.env.TURN_SHARED_SECRET>
 *   lt-cred-mech
 *   realm=turn.yourdomain.com
 *
 * Mode B: Managed Provider API (e.g. Metered.ca Paid Tier / Twilio)
 * -------------------------------------------------------------
 * When METERED_API_KEY and METERED_APP_NAME are configured,
 * queries provider REST endpoint for provider-issued time-limited credentials.
 */
export class TurnService {
    public static async generateCredentials(userId: string): Promise<TurnCredentialResponse> {
        // Mode B: Managed Metered Provider API if configured
        if (config.meteredApiKey && config.meteredAppName) {
            try {
                const url = `https://${config.meteredAppName}.metered.live/api/v1/turn/credentials?apiKey=${config.meteredApiKey}`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`Metered API returned status ${res.status}`);
                }
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) {
                    const primary = data[0];
                    const urls = typeof primary.urls === 'string' ? [primary.urls] : primary.urls;
                    return {
                        urls: urls || config.turnUrls,
                        username: primary.username,
                        credential: primary.credential,
                        ttl: config.turnTtl,
                    };
                }
            } catch (err) {
                console.error('[TurnService] Managed provider API fetch failed, falling back to coturn HMAC scheme:', err);
            }
        }

        // Mode A: Standard RFC 5766 / Coturn REST API (HMAC-SHA1 shared secret)
        const ttl = config.turnTtl || 3600; // 1 hour TTL
        const expiry = Math.floor(Date.now() / 1000) + ttl;
        const username = `${expiry}:${userId}`;

        const hmac = crypto.createHmac('sha1', config.turnSharedSecret);
        hmac.update(username);
        const credential = hmac.digest('base64');

        return {
            urls: config.turnUrls,
            username,
            credential,
            ttl,
        };
    }
}
