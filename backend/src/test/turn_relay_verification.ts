import crypto from 'node:crypto';
import { TurnService } from '../services/turn.service.js';
import { config } from '../config/index.js';

/**
 * Standalone TURN Credential & Relay Allocation Verification Script
 */
async function runTurnVerification() {
    console.log('====================================================');
    console.log('🧪 WebRTC TURN Credential & Security Verification');
    console.log('====================================================\n');

    const testUserId = 'usr_alice_001';

    // 1. Generate Ephemeral Credentials
    console.log('1. Testing Ephemeral Credential Generation (HMAC-SHA1)...');
    const creds = await TurnService.generateCredentials(testUserId);

    console.log('   ✓ URLs:', creds.urls);
    console.log('   ✓ Username:', creds.username);
    console.log('   ✓ Credential (HMAC-SHA1 Base64):', creds.credential);
    console.log('   ✓ TTL:', creds.ttl, 'seconds');

    // 2. Validate Username Format (<expiry_unix_timestamp>:<user_id>)
    console.log('\n2. Validating Coturn Username Structure...');
    const [expiryStr, parsedUserId] = creds.username.split(':');
    const expiryTimestamp = parseInt(expiryStr, 10);
    const now = Math.floor(Date.now() / 1000);

    if (!expiryTimestamp || parsedUserId !== testUserId) {
        throw new Error(`FAIL: Malformed username structure: ${creds.username}`);
    }
    if (expiryTimestamp <= now || expiryTimestamp > now + creds.ttl + 5) {
        throw new Error(`FAIL: Invalid expiry timestamp: ${expiryTimestamp}, current time: ${now}`);
    }
    console.log(`   ✓ Username successfully formatted: expiry=${expiryTimestamp} (+${expiryTimestamp - now}s), user=${parsedUserId}`);

    // 3. Cryptographic Signature Verification against Shared Secret
    console.log('\n3. Validating HMAC-SHA1 Cryptographic Signature...');
    const expectedHmac = crypto.createHmac('sha1', config.turnSharedSecret);
    expectedHmac.update(creds.username);
    const expectedCredential = expectedHmac.digest('base64');

    if (creds.credential !== expectedCredential) {
        throw new Error(`FAIL: Credential HMAC mismatch!\nExpected: ${expectedCredential}\nReceived: ${creds.credential}`);
    }
    console.log('   ✓ HMAC-SHA1 signature matches server shared secret perfectly.');

    // 4. Security Audit: Secret Non-Leakage
    console.log('\n4. Verifying Shared Secret Isolation...');
    if (creds.credential.includes(config.turnSharedSecret) || creds.username.includes(config.turnSharedSecret)) {
        throw new Error('FAIL: Shared secret leaked in plaintext within credentials response!');
    }
    console.log('   ✓ Shared secret is never exposed in plaintext.');

    console.log('\n====================================================');
    console.log('✅ ALL TURN CREDENTIAL TESTS PASSED');
    console.log('====================================================');
}

runTurnVerification().catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
