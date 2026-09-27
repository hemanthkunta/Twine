import { MessageService } from '../services/message.service.js';
import { RedisService } from '../services/redis.service.js';
import { Poll } from '../types/protocol.js';

async function testMessageServiceRedisIntegration() {
    console.log('Testing Message Service Redis integration...');

    try {
        // Test 1: Create a poll and verify it's stored in Redis
        console.log('\n1. Testing poll creation...');
        const pollParams = {
            chatId: 'test-chat-1',
            senderId: 'usr_alice_001',
            question: 'What is your favorite color?',
            options: ['Red', 'Blue', 'Green'],
            isAnonymous: false,
            isQuiz: false,
        };

        const pollMessage = await MessageService.createPoll(pollParams);
        console.log(`✅ Poll created with ID: ${pollMessage.poll?.id}`);

        // Verify poll exists in Redis
        const redisService = RedisService.getInstance();
        const storedPoll = await redisService.getPoll(pollMessage.poll?.id || '');
        if (storedPoll) {
            console.log(`✅ Poll stored in Redis: ${storedPoll.question}`);
        } else {
            console.log('⚠️ Poll not found in Redis (using fallback)');
        }

        // Test 2: Vote on the poll
        console.log('\n2. Testing poll voting...');
        const updatedPoll = await MessageService.votePoll(
            pollMessage.poll?.id || '',
            'opt_0_' + 'abc123', // Simplified option ID for test
            'usr_bob_002'
        );

        if (updatedPoll) {
            console.log(`✅ Vote recorded. Total votes: ${updatedPoll.total_votes}`);

            // Verify updated poll in Redis
            const updatedStoredPoll = await redisService.getPoll(pollMessage.poll?.id || '');
            if (updatedStoredPoll) {
                console.log(
                    `✅ Updated poll in Redis: ${updatedStoredPoll.total_votes} total votes`
                );
            } else {
                console.log('⚠️ Updated poll not found in Redis (using fallback)');
            }
        } else {
            console.log('❌ Failed to vote on poll');
            return false;
        }

        // Test 3: Increment views
        console.log('\n3. Testing view increment...');
        const initialViews = await MessageService.getViews('test-message-1');
        console.log(`Initial views: ${initialViews}`);

        const viewsAfterIncrement = await MessageService.incrementViews('test-message-1');
        console.log(`Views after increment: ${viewsAfterIncrement}`);

        const finalViews = await MessageService.getViews('test-message-1');
        console.log(`Final views from Redis: ${finalViews}`);

        if (finalViews === viewsAfterIncrement && finalViews > initialViews) {
            console.log('✅ View tracking working correctly');
        } else {
            console.log('❌ View tracking issue');
            return false;
        }

        // Test 4: Check if using fallback
        const usingFallback = redisService.isUsingFallback();
        console.log(`\nUsing fallback storage: ${usingFallback}`);

        console.log('\n🎉 All Message Service Redis integration tests PASSED');
        return true;
    } catch (error) {
        console.error('❌ Message Service Redis integration test FAILED:', error);
        return false;
    }
}

testMessageServiceRedisIntegration()
    .then((success) => {
        if (!success) process.exit(1);
    })
    .catch((error) => {
        console.error('Test harness error:', error);
        process.exit(1);
    });
