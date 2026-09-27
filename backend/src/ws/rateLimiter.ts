// Connection rate limiting: limit new WebSocket connections per IP
const newConnectionRateBuckets = new Map();
// Concurrent connection tracking: limit number of simultaneous connections per IP
const connectionCounts = new Map();

// Configuration
const MAX_CONCURRENT_CONNECTIONS_PER_IP = 5;
const NEW_CONNECTION_RATE_LIMIT = 10; // max new connections per minute
const NEW_CONNECTION_RATE_INTERVAL = 60000; // 60 seconds in milliseconds

/**
 * Check if a new WebSocket connection is allowed based on IP-based rate limiting.
 * Uses token bucket algorithm: refills NEW_CONNECTION_RATE_LIMIT tokens every NEW_CONNECTION_RATE_INTERVAL ms.
 * @param ip Client IP address
 * @returns true if connection is allowed, false otherwise
 */
export function checkNewConnectionRate(ip: string): boolean {
    const now = Date.now();
    const key = `new_conn:${ip}`;
    let bucket = newConnectionRateBuckets.get(key);
    if (!bucket) {
        bucket = { tokens: NEW_CONNECTION_RATE_LIMIT, lastRefill: now };
        newConnectionRateBuckets.set(key, bucket);
    } else {
        const elapsedSec = (now - bucket.lastRefill) / 1000;
        // Refill rate: NEW_CONNECTION_RATE_LIMIT tokens per NEW_CONNECTION_RATE_INTERVAL ms
        bucket.tokens = Math.min(NEW_CONNECTION_RATE_LIMIT, bucket.tokens + elapsedSec * (NEW_CONNECTION_RATE_LIMIT / (NEW_CONNECTION_RATE_INTERVAL / 1000)));
        bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
        return false;
    }
    bucket.tokens -= 1;
    return true;
}

/**
 * Get current connection count for an IP.
 * @param ip Client IP address
 * @returns current connection count
 */
export function getConnectionCount(ip: string): number {
    return connectionCounts.get(ip) || 0;
}

/**
 * Increment connection count for an IP.
 * @param ip Client IP address
 */
export function incrementConnectionCount(ip: string): void {
    const current = getConnectionCount(ip);
    connectionCounts.set(ip, current + 1);
}

/**
 * Decrement connection count for an IP, cleaning up if zero.
 * @param ip Client IP address
 */
export function decrementConnectionCount(ip: string): void {
    const current = getConnectionCount(ip);
    if (current <= 1) {
        connectionCounts.delete(ip);
    } else {
        connectionCounts.set(ip, current - 1);
    }
}

export { MAX_CONCURRENT_CONNECTIONS_PER_IP };