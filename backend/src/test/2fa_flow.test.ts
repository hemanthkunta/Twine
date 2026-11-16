/**
 * Two-factor authentication end-to-end audit.
 *
 * Covers the pending-secret activation flow (enable -> confirm -> active), the
 * login challenge (password and OTP), single-use challenges, attempt lockout,
 * backup-code consumption and the disable path.
 *
 * Runs entirely in-process against a temporary SQLite database, so no backend
 * server is required.
 *
 * Run: node --import tsx src/test/2fa_flow.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { generateSecret, generateSync } from 'otplib';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-2fa-'));
process.env.DB_PATH = path.join(directory, 'test.db');
process.env.UPLOADS_DIR = path.join(directory, 'uploads');
process.env.NODE_ENV = 'test';
process.env.SMS_PROVIDER = 'test';

const { initDatabase } = await import('../db/index.js');
const { OTPService } = await import('../services/otp.service.js');
const { router } = await import('../http/routes.js');

initDatabase();
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api', router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;

const ALICE = 'usr_alice_001';
const PASSWORD = 'password123';

let checks = 0;
const check = (name: string, value: unknown) => {
    assert.ok(value, name);
    checks++;
    console.log(`PASS ${name}`);
};

const call = async (url: string, token?: string, body?: unknown, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as any };
};

// A code generated from an unrelated secret can never match the account.
const wrongCode = () => generateSync({ secret: generateSecret() });
const login = async () => {
    const response = await call('/auth/login', undefined, { identifier: 'alice', password: PASSWORD });
    return response.body;
};

try {
    console.log('--- setup and pending activation ---');

    const firstLogin = await call('/auth/login', undefined, { identifier: 'alice', password: PASSWORD });
    check('password login succeeds before 2FA is enabled', firstLogin.status === 200 && !!firstLogin.body.token);
    const authToken = firstLogin.body.token;

    const enable = await call('/auth/2fa/enable', authToken, {});
    check('enable returns a TOTP secret', enable.status === 200 && typeof enable.body.secret === 'string' && enable.body.secret.length > 10);
    check('enable returns a QR code data URL', typeof enable.body.qrCodeDataUrl === 'string' && enable.body.qrCodeDataUrl.startsWith('data:image/png;base64,'));
    check('enable reports a pending setup', enable.body.pending === true);
    const secret: string = enable.body.secret;

    const pendingStatus = await call('/auth/2fa/status', authToken);
    check('2FA is not active yet after enable', pendingStatus.body.enabled === false);
    check('status reports the pending setup', pendingStatus.body.pending === true);
    check('status reports no backup codes yet', pendingStatus.body.backupCodesRemaining === 0);

    const wrongVerify = await call('/auth/2fa/verify', authToken, { token: wrongCode() });
    check('a wrong code is a normal rejection, not an error', wrongVerify.status === 200 && wrongVerify.body.valid === false);
    const afterWrong = await call('/auth/2fa/status', authToken);
    check('a wrong code does not activate 2FA', afterWrong.body.enabled === false && afterWrong.body.pending === true);

    const activate = await call('/auth/2fa/verify', authToken, { token: generateSync({ secret }) });
    check('a correct code activates 2FA', activate.status === 200 && activate.body.valid === true && activate.body.activated === true);
    const activeStatus = await call('/auth/2fa/status', authToken);
    check('status shows 2FA as enabled', activeStatus.body.enabled === true);
    check('status reports no pending setup after activation', activeStatus.body.pending === false);
    check('ten backup codes are stored', activeStatus.body.backupCodesRemaining === 10);

    console.log('--- login challenge ---');

    const challengeLogin = await login();
    check('password login returns a 2FA challenge', challengeLogin.requiresTwoFactor === true && typeof challengeLogin.challengeId === 'string');
    check('the challenge response carries no access token', !challengeLogin.accessToken && !challengeLogin.token);
    check('the challenge advertises the totp method', challengeLogin.method === 'totp');
    const challengeId: string = challengeLogin.challengeId;

    const completed = await call('/auth/2fa/challenge', undefined, { challengeId, token: generateSync({ secret }) });
    check('the challenge returns an access token', completed.status === 200 && typeof (completed.body.accessToken ?? completed.body.token) === 'string');
    check('the challenge response returns the signed-in user', completed.body.user?.id === ALICE);

    const replay = await call('/auth/2fa/challenge', undefined, { challengeId, token: generateSync({ secret }) });
    check('a challenge cannot be used twice', replay.status === 400);

    console.log('--- OTP login challenge ---');

    OTPService.storeOTP('+12345678901', '246810');
    const otpLogin = await call('/auth/verify-otp', undefined, { phoneNumber: '+12345678901', otp: '246810' });
    check('OTP login returns a 2FA challenge', otpLogin.status === 200 && otpLogin.body.requiresTwoFactor === true && !otpLogin.body.token);
    const otpCompleted = await call('/auth/2fa/challenge', undefined, { challengeId: otpLogin.body.challengeId, token: generateSync({ secret }) });
    check('the OTP challenge completes with a TOTP code', otpCompleted.status === 200 && otpCompleted.body.user?.id === ALICE);

    console.log('--- attempt handling ---');

    const secondChallenge = (await login()).challengeId;
    const badAttempt = await call('/auth/2fa/challenge', undefined, { challengeId: secondChallenge, token: wrongCode() });
    check('a wrong challenge code is rejected', badAttempt.status === 400);
    const stillUsable = await call('/auth/2fa/challenge', undefined, { challengeId: secondChallenge, token: generateSync({ secret }) });
    check('the challenge survives a wrong code', stillUsable.status === 200 && !!stillUsable.body.token);

    const lockedChallenge = (await login()).challengeId;
    let rejected = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
        const response = await call('/auth/2fa/challenge', undefined, { challengeId: lockedChallenge, token: wrongCode() });
        if (response.status === 400) rejected++;
    }
    check('five wrong codes are rejected', rejected === 5);
    const afterLock = await call('/auth/2fa/challenge', undefined, { challengeId: lockedChallenge, token: generateSync({ secret }) });
    check('the challenge is locked out after five wrong attempts', afterLock.status === 400);

    console.log('--- backup codes ---');

    const regenerated = await call('/auth/2fa/backup-codes', authToken, { token: generateSync({ secret }) });
    check('backup codes can be regenerated with a valid TOTP', regenerated.status === 200 && Array.isArray(regenerated.body.backupCodes) && regenerated.body.backupCodes.length === 10);
    const backupCode: string = regenerated.body.backupCodes[0];

    const backupChallenge = (await login()).challengeId;
    const backupLogin = await call('/auth/2fa/challenge', undefined, { challengeId: backupChallenge, token: backupCode });
    check('a backup code completes the challenge', backupLogin.status === 200 && !!backupLogin.body.token);

    const reuseChallenge = (await login()).challengeId;
    const reuse = await call('/auth/2fa/challenge', undefined, { challengeId: reuseChallenge, token: backupCode });
    check('a backup code cannot be reused', reuse.status === 400);

    console.log('--- disabling ---');

    const disable = await call('/auth/2fa/disable', authToken, { token: generateSync({ secret }) });
    check('2FA can be disabled with a valid TOTP', disable.status === 200 && disable.body.success === true);
    const disabledStatus = await call('/auth/2fa/status', authToken);
    check('2FA is off after disabling', disabledStatus.body.enabled === false);
    const loginAfterDisable = await login();
    check('login works without a challenge after disabling', !!loginAfterDisable.token && !loginAfterDisable.requiresTwoFactor);

    console.log(`2FA AUDIT: ${checks} checks passed.`);
    server.close();
    process.exit(0);
} catch (error) {
    console.error(error);
    server.close();
    process.exit(1);
}
