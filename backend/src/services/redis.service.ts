import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { Poll } from '../types/protocol.js';
import { getLogger } from './logger.service.js';

const logger = getLogger();

export class RedisService {
    private static instance: RedisService;
    private redis: Redis | null = null;
    private isConnected = false;
    private fallbackPolls: Map<string, Poll> = new Map();
    private fallbackViews: Map<string, number> = new Map();

    private constructor() {
        this.initializeRedis();
    }

    private initializeRedis() {
        try {
            this.redis = new Redis({
                host: config.redisHost || 'localhost',
                port: config.redisPort || 6379,
                password: config.redisPassword || undefined,
                db: config.redisDb || 0,
                connectTimeout: 1000,
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
                // Redis is optional outside the production Compose stack. Do not keep a
                // process alive forever when it is unavailable; callers fall back to
                // the in-memory store after this bounded connection attempt window.
                retryStrategy: (attempt) => {
                    if (attempt > 3) {
                        logger.warn(
                            { attempts: attempt },
                            'Redis remained unavailable; retrying has been stopped'
                        );
                        return null;
                    }
                    return Math.min(attempt * 200, 1000);
                },
            });

            this.redis.on('error', (err) => {
                logger.warn(
                    { error: err instanceof Error ? err.message : String(err) },
                    'Redis connection error, falling back to in-memory storage'
                );
                this.isConnected = false;
            });

            this.redis.on('connect', () => {
                logger.info('Connected to Redis');
                this.isConnected = true;
            });

            this.redis.on('close', () => {
                this.isConnected = false;
            });

            this.redis.on('reconnecting', () => {
                this.isConnected = false;
            });
        } catch (err) {
            console.warn(
                'Failed to initialize Redis, falling back to in-memory storage:',
                err instanceof Error ? err.message : String(err)
            );
            this.isConnected = false;
        }
    }

    static getInstance(): RedisService {
        if (!RedisService.instance) {
            RedisService.instance = new RedisService();
        }
        return RedisService.instance;
    }

    static async shutdown(): Promise<void> {
        if (RedisService.instance) {
            await RedisService.instance.disconnect();
        }
    }

    // Polls operations
    async setPoll(pollId: string, poll: Poll): Promise<void> {
        if (this.isConnected && this.redis) {
            try {
                await this.redis.set(`poll:${pollId}`, JSON.stringify(poll));
                return;
            } catch (err) {
                console.warn(
                    'Failed to set poll in Redis, using fallback:',
                    err instanceof Error ? err.message : String(err)
                );
                this.isConnected = false;
            }
        }
        // Fallback to in-memory storage
        this.fallbackPolls.set(pollId, poll);
    }

    async getPoll(pollId: string): Promise<Poll | null> {
        if (this.isConnected && this.redis) {
            try {
                const data = await this.redis.get(`poll:${pollId}`);
                if (data) {
                    return JSON.parse(data);
                }
            } catch (err) {
                console.warn(
                    'Failed to get poll from Redis, using fallback:',
                    err instanceof Error ? err.message : String(err)
                );
                this.isConnected = false;
            }
        }
        // Fallback to in-memory storage
        return this.fallbackPolls.get(pollId) || null;
    }

    async deletePoll(pollId: string): Promise<void> {
        if (this.isConnected && this.redis) {
            try {
                await this.redis.del(`poll:${pollId}`);
                return;
            } catch (err) {
                console.warn(
                    'Failed to delete poll from Redis, using fallback:',
                    err instanceof Error ? err.message : String(err)
                );
                this.isConnected = false;
            }
        }
        // Fallback to in-memory storage
        this.fallbackPolls.delete(pollId);
    }

    // Views operations
    async incrementViews(messageId: string): Promise<number> {
        if (this.isConnected && this.redis) {
            try {
                return await this.redis.incr(`views:${messageId}`);
            } catch (err) {
                console.warn(
                    'Failed to increment views in Redis, using fallback:',
                    err instanceof Error ? err.message : String(err)
                );
                this.isConnected = false;
            }
        }
        // Fallback to in-memory storage
        const current = this.fallbackViews.get(messageId) || 0;
        const updated = current + 1;
        this.fallbackViews.set(messageId, updated);
        return updated;
    }

    async getViews(messageId: string): Promise<number> {
        if (this.isConnected && this.redis) {
            try {
                const views = await this.redis.get(`views:${messageId}`);
                return views ? parseInt(views, 10) : 0;
            } catch (err) {
                console.warn(
                    'Failed to get views from Redis, using fallback:',
                    err instanceof Error ? err.message : String(err)
                );
                this.isConnected = false;
            }
        }
        // Fallback to in-memory storage
        return this.fallbackViews.get(messageId) || 0;
    }

    async setViews(messageId: string, views: number): Promise<void> {
        if (this.isConnected && this.redis) {
            try {
                await this.redis.set(`views:${messageId}`, views.toString());
                return;
            } catch (err) {
                console.warn(
                    'Failed to set views in Redis, using fallback:',
                    err instanceof Error ? err.message : String(err)
                );
                this.isConnected = false;
            }
        }
        // Fallback to in-memory storage
        this.fallbackViews.set(messageId, views);
    }

    // Close connection
    async disconnect(): Promise<void> {
        if (this.redis) {
            this.redis.disconnect();
            this.redis = null;
        }
        this.isConnected = false;
    }

    // For testing - check if using fallback
    isUsingFallback(): boolean {
        return !this.isConnected;
    }
}
