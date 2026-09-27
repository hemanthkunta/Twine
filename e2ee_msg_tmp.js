// Temporary verification (deleted after running): is E2EE actually applied to the
// live send/receive path?
//
// Drives two real browser sessions through the real UI and asserts:
//   1. both users publish identity keys on sign-in
//   2. Alice's message renders as plaintext for both Alice and Bob
//   3. the server stored NO plaintext — content_text is empty, ciphertext present
//   4. the stored ciphertext is a v1 envelope and does not contain the plaintext
//   5. history reload still shows plaintext (decrypt-on-load works)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');

const BASE = 'http://localhost:3000';
const DB = 'backend/e2e_tmp.db';

const COMPOSER = 'input[placeholder="Write a message... (type @ai to query bot)"]';
const SEND_BUTTON = 'button[title="Send Message (Enter)"]';
const AUTH_MODAL = 'div.backdrop-blur-md';

const failures = [];
function check(name, ok, detail) {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
    if (!ok) {
        failures.push(name);
        if (detail) console.log('     ' + String(detail).split('\n')[0]);
    }
}

async function login(page, username) {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const modal = page.locator(AUTH_MODAL);
    const field = modal.locator('input[placeholder="Username (e.g. alice or bob)"]');
    await field.waitFor({ timeout: 25000 });
    await field.fill(username);
    await modal.locator('input[placeholder="Password"]').fill('password123');
    await modal.locator('form button[type="submit"]').click();
    await page.waitForSelector(COMPOSER, { timeout: 30000 });
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const alice = await ctxA.newPage();
    const bob = await ctxB.newPage();
    const errors = [];
    for (const [n, p] of [['alice', alice], ['bob', bob]]) {
        p.on('pageerror', (e) => errors.push(`${n} pageerror: ${e.message}`));
        p.on('console', (m) => {
            if (m.type() === 'error') errors.push(`${n} console: ${m.text()}`);
        });
    }

    try {
        console.log('--- sign in (publishes identity keys) ---');
        await login(alice, 'alice');
        await login(bob, 'bob');
        await alice.waitForTimeout(2500);

        // Both clients publish their public key during bootstrap.
        const publishedAlice = await alice.evaluate(async () => {
            const { CryptoService } = await import('/src/services/crypto.ts');
            return CryptoService.getPublicKey();
        });
        const publishedBob = await bob.evaluate(async () => {
            const { CryptoService } = await import('/src/services/crypto.ts');
            return CryptoService.getPublicKey();
        });
        check('alice has an identity key in the client', Boolean(publishedAlice), publishedAlice);
        check('bob has an identity key in the client', Boolean(publishedBob), publishedBob);

        const probeToken = await (async () => {
            const r = await fetch('http://localhost:4000/api/auth/demo-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: 'usr_bob_002' }),
            });
            const j = await r.json();
            return j.accessToken || j.token || j.access_token;
        })();
        const fetchKey = async (uid) => {
            const r = await fetch(`http://localhost:4000/api/keys/${uid}`, {
                headers: { Authorization: `Bearer ${probeToken}` },
            });
            return r.ok ? (await r.json()).public_key : `<${r.status}>`;
        };
        const dirAlice = await fetchKey('usr_alice_001');
        const dirBob = await fetchKey('usr_bob_002');
        check(
            'alice\'s published key matches her in-browser key',
            dirAlice === publishedAlice,
            `dir=${dirAlice} browser=${publishedAlice}`
        );
        check(
            'bob\'s published key matches his in-browser key',
            dirBob === publishedBob,
            `dir=${dirBob} browser=${publishedBob}`
        );

        console.log('\n--- send an encrypted message through the real UI ---');
        await alice.click('text=Bob Vance', { timeout: 15000 });
        await alice.waitForSelector(COMPOSER, { timeout: 15000 });
        const secret = `top secret ${Date.now()}`;
        await alice.fill(COMPOSER, secret);
        await alice.waitForSelector(SEND_BUTTON, { timeout: 15000 });
        await alice.click(SEND_BUTTON);
        await alice.waitForSelector(`text=${secret}`, { timeout: 15000 });
        check('alice sees her own plaintext', true);

        await bob.waitForSelector(`text=${secret}`, { timeout: 20000 });
        check('bob sees decrypted plaintext', true);

        console.log('\n--- what did the SERVER store? ---');
        const db = new DatabaseSync(DB);
        const row = db
            .prepare(
                `SELECT content_text, ciphertext_payload FROM messages
                 WHERE content_text = ? OR content_text = '' OR ciphertext_payload IS NOT NULL
                 ORDER BY created_at DESC LIMIT 1`
            )
            .get();

        check('a message row exists to inspect', Boolean(row));
        if (row) {
            check(
                'server did NOT store the plaintext in content_text',
                !row.content_text || !row.content_text.includes(secret),
                `content_text = ${JSON.stringify(row.content_text)}`
            );
            check('ciphertext_payload is present', Boolean(row.ciphertext_payload));

            let envelope = null;
            try {
                envelope = JSON.parse(row.ciphertext_payload);
            } catch {
                /* not JSON */
            }
            check('payload is a v1 envelope {v,n,c}', envelope?.v === 1 && !!envelope.n && !!envelope.c);
            check(
                'stored ciphertext does not contain the plaintext',
                !String(row.ciphertext_payload).includes(secret)
            );

            const leaks = db
                .prepare('SELECT COUNT(*) AS c FROM messages WHERE content_text LIKE ?')
                .get(`%${secret}%`);
            check('no row anywhere leaks the plaintext', leaks.c === 0, `rows matching: ${leaks.c}`);
        }
        db.close();

        console.log('\n--- reload history: decrypt-on-load ---');
        await bob.reload({ waitUntil: 'domcontentloaded' });
        await bob.waitForSelector(COMPOSER, { timeout: 30000 });
        await bob.click('text=Alice Walker', { timeout: 15000 });
        await bob.waitForSelector(`text=${secret}`, { timeout: 25000 });
        check('bob sees the plaintext again after a reload', true);

        // The subtle case: for a message Alice SENT, the conversation key comes
        // from Bob's public key, not the sender's. Looking up the sender's key
        // unconditionally would leave the sender unable to read her own history.
        await alice.reload({ waitUntil: 'domcontentloaded' });
        await alice.waitForSelector(COMPOSER, { timeout: 30000 });
        await alice.click('text=Bob Vance', { timeout: 15000 });
        await alice.waitForSelector(`text=${secret}`, { timeout: 25000 });
        check('alice can read her own sent history after a reload', true);

        // Chat list previews read last_message.content_text, which is empty for a
        // sealed message — without decrypting it the sidebar would say
        // "No messages yet" even though a message exists.
        for (const [name, page, peerName] of [
            ['bob', bob, 'Alice Walker'],
            ['alice', alice, 'Bob Vance'],
        ]) {
            const row = page.locator('.interactive-card', { hasText: peerName }).first();
            const rowText = (await row.innerText()).replace(/\s+/g, ' ');
            check(
                `${name}'s chat list preview shows the decrypted text`,
                rowText.includes(secret),
                rowText
            );
        }
    } catch (err) {
        check('scenario completed without throwing', false, err.message);
        try {
            console.log('\n--- DIAGNOSTICS ---');
            console.log('console/page errors:\n  ' + (errors.slice(0, 8).join('\n  ') || 'none'));
            console.log('alice body: ' + (await alice.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 700));
            console.log('bob body: ' + (await bob.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 700));
        } catch (e) {
            console.log('dump failed: ' + e.message);
        }
    } finally {
        await ctxA.close();
        await ctxB.close();
        await browser.close();
    }

    console.log('');
    if (failures.length === 0) {
        console.log('🎉 All encrypted-messaging checks passed!');
        process.exit(0);
    }
    console.log(`❌ ${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
})();
