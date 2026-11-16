import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import webPush from 'web-push';
import { KeyHelper } from 'libsignal-protocol-typescript';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-core-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.UPLOADS_DIR = path.join(directory, 'uploads');
process.env.NODE_ENV = 'test';
process.env.SMS_PROVIDER = 'webhook';
process.env.SMS_WEBHOOK_URL = 'https://sms.example.test/send';
const { db, initDatabase } = await import('../db/index.js');
const { MessageService } = await import('../services/message.service.js');
const { PushNotificationService: Push } = await import('../services/push.service.js');
const { OTPService } = await import('../services/otp.service.js');
const { KeyDirectoryService } = await import('../services/keyDirectory.service.js');
const { router } = await import('../http/routes.js');
initDatabase();
const app = express(); app.use(express.json({ limit: '2mb' })); app.use('/api', router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
const alice = 'usr_alice_001', bob = 'usr_bob_002', charlie = 'core_charlie', outsider = 'core_outsider';
for (const id of [charlie, outsider]) db.prepare("INSERT INTO users(id,phone_number,username,display_name) VALUES(?,?,?,?)").run(id, id, id, id);
let checks = 0;
const check = (name: string, value: unknown) => { assert.ok(value, name); checks++; console.log(`PASS ${name}`); };
const call = async (url: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json().catch(() => null) as any };
};
try {
    const identity = await KeyHelper.generateIdentityKeyPair();
    const signed = await KeyHelper.generateSignedPreKey(identity, 1);
    const b64 = (value: ArrayBuffer) => Buffer.from(value).toString('base64');
    check('real Signal signed prekey accepted', await KeyDirectoryService.verifySignedPreKey(b64(identity.pubKey), b64(signed.keyPair.pubKey), b64(signed.signature)));
    const corrupt = new Uint8Array(signed.signature.slice(0)); corrupt[0] ^= 1;
    check('tampered Signal signature rejected', !await KeyDirectoryService.verifySignedPreKey(b64(identity.pubKey), b64(signed.keyPair.pubKey), b64(corrupt.buffer)));
    const tokens: Record<string, string> = {};
    for (const id of [alice, bob, charlie, outsider]) {
        const login = await call('/auth/demo-login', undefined, { userId: id });
        tokens[id] = login.body.accessToken ?? login.body.token;
        assert.ok(tokens[id]);
    }
    for (const [id, type, members] of [
        ['core_source', 'DIRECT', [alice, bob]], ['core_target', 'DIRECT', [bob, charlie]],
        ['core_channel', 'CHANNEL', [alice, bob]],
    ] as const) {
        db.prepare('INSERT INTO chats(id,type,creator_id,is_e2ee) VALUES(?,?,?,0)').run(id, type, members[0]);
        members.forEach((user, i) => db.prepare('INSERT INTO chat_members(id,chat_id,user_id,role) VALUES(?,?,?,?)').run(id + user, id, user, i ? 'MEMBER' : 'OWNER'));
    }
    const original = await MessageService.createMessage({ chatId: 'core_source', senderId: alice, contentText: 'audit keyword' });
    const forward = (user: string, messageId: string, target: string, payload?: string) => call('/messages/forward', tokens[user], {
        messageId, targetChatIds: [target], ...(payload ? { destinationPayloads: { [target]: payload } } : {}),
    });
    check('channel subscriber forwarding forbidden over HTTP', (await forward(bob, original.id, 'core_channel')).status === 403);
    check('channel owner forwarding permitted', (await forward(alice, original.id, 'core_channel')).status === 200);
    db.prepare("UPDATE chat_members SET role='ADMIN' WHERE chat_id='core_channel' AND user_id=?").run(bob);
    check('channel admin forwarding permitted', (await forward(bob, original.id, 'core_channel')).status === 200);
    db.prepare("UPDATE chat_members SET role='MEMBER' WHERE chat_id='core_channel' AND user_id=?").run(bob);
    await assert.rejects(MessageService.createMessage({ chatId: 'core_channel', senderId: bob, contentText: 'bypass' })); checks++;
    const encrypted = await MessageService.createMessage({ chatId: 'core_source', senderId: alice, contentText: '', ciphertextPayload: 'source-sealed' });
    check('encrypted forward without destination ciphertext rejected', (await forward(bob, encrypted.id, 'core_target')).status === 400);
    check('copied source ciphertext rejected', (await forward(bob, encrypted.id, 'core_target', 'source-sealed')).status === 400);
    const fresh = await forward(bob, encrypted.id, 'core_target', 'fresh-destination-sealed');
    check('fresh destination envelope preserved without plaintext', fresh.status === 200 && fresh.body.messages[0].ciphertext_payload === 'fresh-destination-sealed' && fresh.body.messages[0].content_text === '');
    check('search excludes ciphertext messages', !(await MessageService.searchMessages(bob, { query: '' })).some(m => m.ciphertext_payload));
    const upload = await call('/media/upload', tokens[alice], { base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV3sAAAAASUVORK5CYII=', fileName: 'avatar.png', mimeType: 'image/png' });
    assert.equal(upload.status, 200); const media = upload.body.media.url;
    check('avatar profile save', (await call('/users/profile', tokens[alice], { avatarUrl: media }, 'PUT')).status === 200);
    const mediaStatus = async (user?: string) => (await fetch(base + media, { headers: user ? { Authorization: `Bearer ${tokens[user]}` } : {} })).status;
    check('avatar owner can fetch', await mediaStatus(alice) === 200);
    check('avatar shared-chat peer can fetch', await mediaStatus(bob) === 200);
    check('avatar outsider forbidden', await mediaStatus(outsider) === 403);
    check('avatar anonymous forbidden', await mediaStatus() === 419);
    check('outsider cannot claim another upload as avatar', (await call('/users/profile', tokens[outsider], { avatarUrl: media }, 'PUT')).status !== 200);
    const attachment = await MessageService.createMessage({ chatId: 'core_source', senderId: alice, contentText: '', mediaUrl: media, type: 'IMAGE' });
    check('forward attachment HTTP success', (await forward(bob, attachment.id, 'core_target')).status === 200);
    check('destination-only recipient can fetch forwarded attachment', await mediaStatus(charlie) === 200);
    check('unrelated outsider cannot fetch forwarded attachment', await mediaStatus(outsider) === 403);
    const keys = webPush.generateVAPIDKeys();
    const sub = { userId: charlie, endpoint: 'https://fcm.googleapis.com/fcm/send/core-test', keys: { p256dh: keys.publicKey, auth: Buffer.alloc(16, 1).toString('base64url') } };
    Push.saveSubscription(sub);
    delete process.env.VAPID_PUBLIC_KEY;
    check('unconfigured push never reports success', !(await Push.sendPush(charlie, 'Test', 'Body')).sent);
    process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey; process.env.VAPID_SUBJECT = 'mailto:test@example.test';
    const realSend = webPush.sendNotification;
    let calls = 0;
    webPush.sendNotification = (async (_sub: any, payload: any) => { calls++; check('push contains no message text', !String(payload).includes('audit keyword')); return { statusCode: 201 }; }) as any;
    check('push success requires provider acknowledgement', (await Push.sendPush(charlie, 'Twine', 'New message')).sent);
    await Push.notifyOfflineMessage('core_target', bob, original.id);
    check('offline recipient dispatched', calls >= 2);
    webPush.sendNotification = (async () => { throw { statusCode: 503 }; }) as any;
    check('provider failure reported', !(await Push.sendPush(charlie, 'Test', 'Body')).sent);
    webPush.sendNotification = (async () => { throw { statusCode: 410 }; }) as any;
    await Push.sendPush(charlie, 'Test', 'Body');
    check('expired subscription removed', Push.getSubscriptions(charlie).length === 0);
    webPush.sendNotification = realSend;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;
    OTPService.storeOTP('+15550000001', '123456');
    await assert.rejects(OTPService.sendOTP('+15550000001', '123456'));
    check('failed SMS invalidates OTP and cooldown', OTPService.peekOTP('+15550000001') === null && OTPService.getResendCooldownSeconds('+15550000001') === 0);
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    await OTPService.sendOTP('+15550000001', '123456'); checks++;
    globalThis.fetch = realFetch;
    console.log(`CORE AUDIT: ${checks} checks passed. Provider responses mocked; physical delivery not claimed.`);
    server.close(); process.exit(0);
} catch (error) { console.error(error); server.close(); process.exit(1); }
