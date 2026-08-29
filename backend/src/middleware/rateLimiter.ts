import { Request, Response, NextFunction } from 'express';

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
  private static buckets: Map<string, RateLimitBucket> = new Map();

  /**
   * Token Bucket rate limiter middleware
   * @param maxTokens Maximum burst capacity
   * @param refillRateTokensPerSec Refill rate in tokens per second
   */
  static createMiddleware(maxTokens = 300, refillRateTokensPerSec = 20.0) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const userId = (req as any).user?.id || (req.headers.authorization ? 'auth_user' : 'anonymous');
      const key = `${clientIp}:${userId}:${req.baseUrl || req.path}`;
      const now = Date.now();

      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = { tokens: maxTokens, lastRefill: now };
        this.buckets.set(key, bucket);
      } else {
        // Refill tokens based on elapsed time
        const elapsedSec = (now - bucket.lastRefill) / 1000;
        bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsedSec * refillRateTokensPerSec);
        bucket.lastRefill = now;
      }

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        res.setHeader('X-RateLimit-Limit', maxTokens.toString());
        res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens).toString());
        next();
      } else {
        const retryAfterSec = Math.ceil((1 - bucket.tokens) / refillRateTokensPerSec);
        res.setHeader('Retry-After', retryAfterSec.toString());
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please retry after a cooldown period.',
          retryAfterSeconds: retryAfterSec,
        });
      }
    };
  }

  /**
   * Check rate limit for WebSocket frames per second
   */
  static checkWsLimit(userId: string, maxFramesPerSec = 30): boolean {
    const key = `ws:${userId}`;
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: maxFramesPerSec, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(maxFramesPerSec, bucket.tokens + elapsedSec * maxFramesPerSec);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Periodic cleanup to prevent unbounded memory growth
   */
  static startCleanupInterval(intervalMs = 60000, maxIdleMs = 120000) {
    setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets.entries()) {
        if (now - bucket.lastRefill > maxIdleMs) {
          this.buckets.delete(key);
        }
      }
    }, intervalMs);
  }
}

RateLimiter.startCleanupInterval();
