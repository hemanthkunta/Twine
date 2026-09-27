import { RedisService } from '../services/redis.service.js';

async function testRedisConnection() {
    console.log('Testing Redis connection...');

    try {
        const redisService = RedisService.getInstance();
        // Test connection by setting and getting a value
        await redisService.setViews('test-message', 42);
        const views = await redisService.getViews('test-message');
        console.log(`Views retrieved: ${views}`);

        if (views === 42) {
            console.log('✅ Redis connection test PASSED');
        } else {
            console.log('❌ Redis connection test FAILED: unexpected value');
            process.exit(1);
        }

        // Test increment
        const newViews = await redisService.incrementViews('test-message');
        console.log(`Views after increment: ${newViews}`);

        if (newViews === 43) {
            console.log('✅ Redis increment test PASSED');
        } else {
            console.log('❌ Redis increment test FAILED: unexpected value');
            process.exit(1);
        }

        // Clean up
        await redisService.disconnect();
        console.log('✅ Redis connection test completed successfully');
        return true;
    } catch (error) {
        console.error('❌ Redis connection test FAILED:', error);
        process.exit(1);
    }
}

testRedisConnection();
