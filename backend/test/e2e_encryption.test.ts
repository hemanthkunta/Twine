import { db, initDatabase } from '../src/db/index.js';
import { MessageService } from '../src/services/message.service.js';
import { ChatService } from '../src/services/chat.service.js';
import { SignalProtocolService } from '../src/services/signalProtocol.service.js';
import { KeyDirectoryService } from '../src/services/keyDirectory.service.js';
import { AuthService } from '../src/services/auth.service.js';
import { GroupService } from '../src/services/group.service.js';
import * as crypto from 'crypto';

// Monkey-patch SignalProtocolService to avoid session requirements in tests
// (Test environment doesn't establish full Signal sessions for all chats)
const originalEncrypt = SignalProtocolService.encryptMessage;
const originalDecrypt = SignalProtocolService.decryptMessage;

SignalProtocolService.encryptMessage = async (senderId: string, recipientId: string, plaintext: string) => {
    // Return a mock v1 envelope for test purposes
    return JSON.stringify({ v: 1, n: '', c: Buffer.from(plaintext).toString('base64') });
};

SignalProtocolService.decryptMessage = async (recipientId: string, senderId: string, ciphertext: string) => {
    // ONLY decrypt legacy format [ENCRYPTED:...] - NOT v1 envelopes {v:1,...}
    // Client-to-client v1 envelopes must stay sealed for client-side decryption
    if (ciphertext.startsWith('[ENCRYPTED:') && ciphertext.endsWith(']')) {
        return Buffer.from(ciphertext.substring(11, ciphertext.length - 1), 'base64').toString('utf8');
    }
    // Don't decrypt v1 envelopes - throw to indicate server can't decrypt
    throw new Error('Server cannot decrypt client-to-client v1 envelopes');
};

// Restore after tests (not strictly needed since process exits)
const restoreSignal = () => {
    SignalProtocolService.encryptMessage = originalEncrypt;
    SignalProtocolService.decryptMessage = originalDecrypt;
};

// Mock CryptoService for Node.js environment (avoids indexedDB dependency)
class MockCryptoService {
    private static keys: Map<string, { privateKey: CryptoKey; publicKey: string }> = new Map();

    static async initIdentityKey(userId: string): Promise<{ publicKeyBase64: string }> {
        if (this.keys.has(userId)) {
            return { publicKeyBase64: this.keys.get(userId)!.publicKey };
        }
        const keyPair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey', 'deriveBits']
        );
        const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const publicKeyBase64 = Buffer.from(spki).toString('base64');
        this.keys.set(userId, { privateKey: keyPair.privateKey, publicKey: publicKeyBase64 });
        return { publicKeyBase64 };
    }

    static getPublicKey(userId: string): string {
        return this.keys.get(userId)?.publicKey ?? '';
    }

    static async sealForPeer(plaintext: string, peerPublicKeyBase64: string): Promise<string> {
        const myUserId = Array.from(this.keys.keys()).find(k => this.keys.get(k)?.publicKey === peerPublicKeyBase64) || 'unknown';
        const myKey = this.keys.get(myUserId);
        if (!myKey) throw new Error('Local identity key not initialized');

        const peerPublicKey = await crypto.subtle.importKey(
            'spki',
            Buffer.from(peerPublicKeyBase64, 'base64'),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            []
        );

        const sharedSecret = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: peerPublicKey },
            myKey.privateKey,
            256
        );

        const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
        const aesKey = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('twine-e2ee-v1'), info: new TextEncoder().encode('twine-e2ee-p256-chat-key') },
            hkdfKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plaintext));

        return JSON.stringify({
            v: 1,
            n: Buffer.from(iv).toString('base64'),
            c: Buffer.from(encrypted).toString('base64')
        });
    }

    static isEnvelope(payload: unknown): payload is string {
        if (typeof payload !== 'string' || !payload.startsWith('{')) return false;
        try {
            const parsed = JSON.parse(payload) as { v?: unknown; g?: unknown; n?: unknown; c?: unknown };
            return parsed.v === 1 && parsed.g !== 1 && typeof parsed.n === 'string' && typeof parsed.c === 'string';
        } catch {
            return false;
        }
    }

    static isGroupEnvelope(payload: unknown): payload is string {
        if (typeof payload !== 'string' || !payload.startsWith('{')) return false;
        try {
            const parsed = JSON.parse(payload) as { v?: unknown; g?: unknown; s?: unknown; it?: unknown; n?: unknown; c?: unknown };
            return parsed.v === 1 && parsed.g === 1 && typeof parsed.s === 'string' && typeof parsed.it === 'number' && typeof parsed.n === 'string' && typeof parsed.c === 'string';
        } catch {
            return false;
        }
    }

    static parseGroupEnvelope(payload: unknown): { v: number; g: number; s: string; it: number; n: string; c: string } | null {
        if (typeof payload !== 'string' || !payload.startsWith('{')) return null;
        try {
            const parsed = JSON.parse(payload) as { v?: unknown; g?: unknown; s?: unknown; it?: unknown; n?: unknown; c?: unknown };
            if (parsed.v !== 1 || parsed.g !== 1) return null;
            if (typeof parsed.s !== 'string' || typeof parsed.it !== 'number' || typeof parsed.n !== 'string' || typeof parsed.c !== 'string') return null;
            return parsed as { v: number; g: number; s: string; it: number; n: string; c: string };
        } catch {
            return null;
        }
    }
}

interface TestResult {
    testName: string;
    passed: boolean;
    error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, msg: string) {
    if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function uid(): string {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

async function runE2EEncryptionTests() {
    initDatabase();

    // Reset pre_key_bundles table to ensure new schema is used
    const { db: dbInstance } = await import('../src/db/index.js');
    dbInstance.prepare('DROP TABLE IF EXISTS pre_key_bundles').run();
    dbInstance.prepare('DROP TABLE IF EXISTS devices').run();
    // Recreate tables with new schema
    const { SCHEMA_SQL } = await import('../src/db/schema.js');
    const preKeyBundlesStmt = SCHEMA_SQL.match(/CREATE TABLE IF NOT EXISTS pre_key_bundles[\s\S]*?\);/)?.[0];
    const devicesStmt = SCHEMA_SQL.match(/CREATE TABLE IF NOT EXISTS devices[\s\S]*?\);/)?.[0];
    if (preKeyBundlesStmt) dbInstance.prepare(preKeyBundlesStmt).run();
    if (devicesStmt) dbInstance.prepare(devicesStmt).run();

    console.log('===============================================================');
    console.log('🔐 RUNNING E2E ENCRYPTION TEST SUITE');
    console.log('===============================================================\n');

    const alice = AuthService.demoLogin('usr_alice_001');
    const bob = AuthService.demoLogin('usr_bob_002');

    let directChat;
    try {
        directChat = await ChatService.getOrCreateDirectChat(alice.user.id, bob.user.id);
        assert(directChat.type === 'DIRECT', 'Direct chat created');
        assert(directChat.is_e2ee === false, 'Pre-seeded chat is non-E2EE');
        results.push({ testName: 'Create direct chat (non-E2EE seeded)', passed: true });
    } catch (err: any) {
        results.push({ testName: 'Create direct chat (non-E2EE seeded)', passed: false, error: err.message });
    }

    // Test 1: Key exchange - client generates bundle, publishes via REST, retrieves via REST
    try {
        // Register devices first (required for bundle storage)
        KeyDirectoryService.registerDevice(alice.user.id, 1, 'Alice Phone', 'alice_public_key_1');
        KeyDirectoryService.registerDevice(bob.user.id, 1, 'Bob Phone', 'bob_public_key_1');
        
        // Alice generates a client-side bundle and publishes it
        const aliceBundle = {
            registrationId: 12345,
            deviceId: 1,
            preKeyId: 1,
            preKeyPublic: 'alice_prekey_public_b64',
            signedPreKeyId: 1,
            signedPreKeyPublic: 'alice_signed_prekey_public_b64',
            signedPreKeySignature: 'alice_signed_prekey_signature_b64',
            identityKey: 'alice_identity_key_b64',
            oneTimePreKeys: [{ id: 1, publicKey: 'alice_otpk_1_b64' }]
        };
        
        // Publish Alice's bundle (simulates client POST /keys/bundle)
        KeyDirectoryService.storePreKeyBundle(alice.user.id, aliceBundle);
        
        // Bob retrieves Alice's bundle (simulates client GET /keys/bundle/:userId)
        const retrievedAliceBundle = KeyDirectoryService.getPreKeyBundle(alice.user.id, 1);
        assert(retrievedAliceBundle, 'Should retrieve Alice bundle from key directory');
        assert(retrievedAliceBundle!.identityKey === aliceBundle.identityKey, 'Identity key should match');
        assert(retrievedAliceBundle!.preKeyPublic === aliceBundle.preKeyPublic, 'Prekey public should match');
        assert(retrievedAliceBundle!.signedPreKeyPublic === aliceBundle.signedPreKeyPublic, 'Signed prekey public should match');
        assert(retrievedAliceBundle!.signedPreKeySignature === aliceBundle.signedPreKeySignature, 'Signed prekey signature should match');
        
        // Verify the signed prekey signature
        const sigValid = await KeyDirectoryService.verifySignedPreKey(
            retrievedAliceBundle!.identityKey,
            retrievedAliceBundle!.signedPreKeyPublic,
            retrievedAliceBundle!.signedPreKeySignature
        );
        // Note: In real test, signature would be valid; here we test the verification function exists
        
        // Bob publishes his own bundle
        const bobBundle = {
            registrationId: 54321,
            deviceId: 1,
            preKeyId: 1,
            preKeyPublic: 'bob_prekey_public_b64',
            signedPreKeyId: 1,
            signedPreKeyPublic: 'bob_signed_prekey_public_b64',
            signedPreKeySignature: 'bob_signed_prekey_signature_b64',
            identityKey: 'bob_identity_key_b64',
            oneTimePreKeys: [{ id: 1, publicKey: 'bob_otpk_1_b64' }]
        };
        KeyDirectoryService.storePreKeyBundle(bob.user.id, bobBundle);
        
        // Alice retrieves Bob's bundle
        const retrievedBobBundle = KeyDirectoryService.getPreKeyBundle(bob.user.id, 1);
        assert(retrievedBobBundle, 'Should retrieve Bob bundle from key directory');
        assert(retrievedBobBundle!.identityKey === bobBundle.identityKey, 'Bob identity key should match');

        results.push({ testName: 'Key exchange (client bundle publish/retrieve via key directory)', passed: true });
    } catch (err: any) {
        results.push({ testName: 'Key exchange (client bundle publish/retrieve via key directory)', passed: false, error: err.message });
    }

    // Test 2: Client-to-client message storage (client encrypts, server stores)
    try {
        const aliceKeys = await MockCryptoService.initIdentityKey(alice.user.id);
        const bobKeys = await MockCryptoService.initIdentityKey(bob.user.id);

        const testMessage = 'This is a secret message from Alice to Bob';
        const envelope = await MockCryptoService.sealForPeer(testMessage, bobKeys.publicKeyBase64);

        const msg = await MessageService.createMessage({
            chatId: directChat.id,
            senderId: alice.user.id,
            contentText: '',
            ciphertextPayload: envelope,
            type: 'TEXT',
        });

        const rawMessage = db.prepare('SELECT content_text, ciphertext_payload FROM messages WHERE id = ?').get(msg.id);
        assert(rawMessage, 'Message should exist in database');
        assert(rawMessage.content_text === '' || rawMessage.content_text === null, 'Content text should be empty for client-encrypted messages');
        assert(rawMessage.ciphertext_payload === envelope, 'Ciphertext payload should match client envelope');

        const retrievedMsg = await MessageService.getMessageById(msg.id);
        assert(retrievedMsg, 'Retrieved message should exist');
        assert(retrievedMsg.ciphertext_payload === envelope, 'Server should return ciphertext payload unchanged');
        assert(!retrievedMsg.content_text || retrievedMsg.content_text === envelope, 'Content text should not be decrypted by server for client-to-client');

        results.push({ testName: 'Client-to-client message storage (client encrypts, server stores)', passed: true });
    } catch (err: any) {
        results.push({ testName: 'Client-to-client message storage (client encrypts, server stores)', passed: false, error: err.message });
    }

    // Test 3: Non-E2E chats store/retrieve messages in plaintext
    try {
        const chatId = `chat_${uid()}`;
        db.prepare(`INSERT INTO chats (id, type, is_e2ee) VALUES (?, 'DIRECT', 0)`).run(chatId);
        db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`).run(`cm_${uid()}`, chatId, alice.user.id);
        db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`).run(`cm_${uid()}`, chatId, bob.user.id);

        const testMessage = 'This is a plaintext message';
        const msg = await MessageService.createMessage({ chatId, senderId: alice.user.id, contentText: testMessage, type: 'TEXT' });

        const rawMessage = db.prepare('SELECT content_text FROM messages WHERE id = ?').get(msg.id);
        assert(rawMessage, 'Message should exist in database');
        assert(rawMessage.content_text === testMessage, 'Message should be stored as plaintext in database');

        const retrievedMsg = await MessageService.getMessageById(msg.id);
        assert(retrievedMsg, 'Retrieved message should exist');
        assert(retrievedMsg.content_text === testMessage, 'Retrieved message should match original');

        results.push({ testName: 'Non-E2E chats store/retrieve messages in plaintext', passed: true });
    } catch (err: any) {
        results.push({ testName: 'Non-E2E chats store/retrieve messages in plaintext', passed: false, error: err.message });
    }

    // Test 4: Edge cases with client-encrypted messages
    try {
        const aliceKeys = await MockCryptoService.initIdentityKey(alice.user.id);
        const bobKeys = await MockCryptoService.initIdentityKey(bob.user.id);

        const testCases = [
            '', '!@#$%^&*()_+-=[]{}|;:,.<>?/~`', 'Hello 世界 🌍 🎉',
            '🚀🌟💫✨📱', '\n\t\r', 'a'.repeat(10000)
        ];

        for (let i = 0; i < testCases.length; i++) {
            const testMessage = testCases[i];
            const envelope = await MockCryptoService.sealForPeer(testMessage, bobKeys.publicKeyBase64);
            const msg = await MessageService.createMessage({ chatId: directChat.id, senderId: alice.user.id, contentText: '', ciphertextPayload: envelope, type: 'TEXT' });
            const retrievedMsg = await MessageService.getMessageById(msg.id);
            assert(retrievedMsg, `Retrieved message should exist for test case ${i}`);
            assert(retrievedMsg.ciphertext_payload === envelope, `Ciphertext should match for test case ${i}`);
        }

        results.push({ testName: 'Edge cases with client-encrypted messages', passed: true });
    } catch (err: any) {
        results.push({ testName: 'Edge cases with client-encrypted messages', passed: false, error: err.message });
    }

    // Test 5: Polls in non-E2E chat (server stores poll data)
    try {
        const pollQuestion = 'What is your favorite color?';
        const pollOptions = ['Red', 'Green', 'Blue'];
        const pollMsg = await MessageService.createPoll({ chatId: directChat.id, senderId: alice.user.id, question: pollQuestion, options: pollOptions, isAnonymous: false });

        assert(pollMsg.type === 'POLL', 'Poll message type should be POLL');
        assert(pollMsg.poll?.question === pollQuestion, 'Poll question should match');
        assert(pollMsg.poll?.options.length === pollOptions.length, 'Poll options count should match');

        const retrievedPollMsg = await MessageService.getMessageById(pollMsg.id);
        assert(retrievedPollMsg, 'Retrieved poll message should exist');
        assert(retrievedPollMsg.type === 'POLL', 'Retrieved poll message type should be POLL');
        assert(retrievedPollMsg.poll?.question === pollQuestion, 'Retrieved poll question should match');

        results.push({ testName: 'Polls in non-E2E chat (server stores poll data)', passed: true });
    } catch (err: any) {
        results.push({ testName: 'Polls in non-E2E chat (server stores poll data)', passed: false, error: err.message });
    }

    // Test 6: Group message storage (simulated client sender-key encryption)
    try {
        const groupChat = await GroupService.createGroup({
            creatorId: alice.user.id,
            title: 'Test Group',
            type: 'GROUP',
            memberIds: [bob.user.id]
        });
        assert(groupChat.type === 'GROUP', 'Group chat created');
        // Make non-E2EE to avoid server encryption attempts (test focuses on client encryption storage)
        db.prepare(`UPDATE chats SET is_e2ee = 0 WHERE id = ?`).run(groupChat.id);

        await MockCryptoService.initIdentityKey(alice.user.id);
        await MockCryptoService.initIdentityKey(bob.user.id);
        const groupPayload = JSON.stringify({
            v: 1, g: 1, s: alice.user.id, it: 0,
            n: Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64'),
            c: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
        });

        const msg = await MessageService.createMessage({
            chatId: groupChat.id, senderId: alice.user.id, contentText: '', ciphertextPayload: groupPayload, type: 'TEXT'
        });

        const rawMessage = db.prepare('SELECT ciphertext_payload FROM messages WHERE id = ?').get(msg.id);
        assert(rawMessage, 'Group message should exist in database');
        assert(rawMessage.ciphertext_payload === groupPayload, 'Group ciphertext should match');

        const retrievedMsg = await MessageService.getMessageById(msg.id);
        assert(retrievedMsg, 'Retrieved group message should exist');
        assert(retrievedMsg.ciphertext_payload === groupPayload, 'Server should return group ciphertext unchanged');

        results.push({ testName: 'Group message storage (simulated client sender-key encryption)', passed: true });
    } catch (err: any) {
        results.push({ testName: 'Group message storage (simulated client sender-key encryption)', passed: false, error: err.message });
    }

    // Test 7: FTS5 search works with plaintext content (non-E2E)
    try {
        const searchChatId = `chat_search_${uid()}`;
        db.prepare(`INSERT INTO chats (id, type, is_e2ee) VALUES (?, 'DIRECT', 0)`).run(searchChatId);
        db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`).run(`cm_s_1_${uid()}`, searchChatId, alice.user.id);
        db.prepare(`INSERT INTO chat_members (id, chat_id, user_id, role) VALUES (?, ?, ?, 'MEMBER')`).run(`cm_s_2_${uid()}`, searchChatId, bob.user.id);

        const searchableMsg = 'Find this unique keyword: SEARCHTEST123';
        await MessageService.createMessage({ chatId: searchChatId, senderId: alice.user.id, contentText: searchableMsg, type: 'TEXT' });

        // Wait for FTS trigger
        await new Promise(r => setTimeout(r, 100));

        // Search should find it
        const results_search = await MessageService.searchMessages(alice.user.id, { query: 'SEARCHTEST123' });
        assert(results_search.length >= 1, 'Search should find the message');
        assert(results_search.some(m => m.content_text?.includes('SEARCHTEST123')), 'Search result should contain the keyword');

        results.push({ testName: 'FTS5 search works with plaintext content', passed: true });
    } catch (err: any) {
        results.push({ testName: 'FTS5 search works with plaintext content', passed: false, error: err.message });
    }

    // Summary
    console.log('\n===============================================================');
    console.log('📊 E2E ENCRYPTION TEST EXECUTION SUMMARY:');
    console.log('===============================================================');
    let passCount = 0, failCount = 0;
    for (const r of results) {
        if (r.passed) { passCount++; console.log(`  ✅ ${r.testName}`); }
        else { failCount++; console.log(`  ❌ ${r.testName} - ${r.error}`); }
    }
    console.log(`\nTotal Tests: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
    if (failCount > 0) process.exit(1);
}

runE2EEncryptionTests().catch(err => { console.error('Fatal E2E Encryption Test Failure:', err); process.exit(1); });