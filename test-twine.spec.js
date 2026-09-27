// End-to-end smoke test for Twine.
//
// Requires the backend (http://localhost:4000) and the client
// (http://localhost:3000) to be running. Run with:
//
//   npm run dev            # in one terminal (from the project root)
//   node test-twine.spec.js
//
// Playwright ships its own Chromium. If only a system browser is available,
// point it at that one instead:
//
//   PW_CHANNEL=chrome node test-twine.spec.js
//
// This spec was previously written against an older UI (a `textarea`
// composer and a "Send" button, neither of which exist any more) so it could
// never pass. Selectors below are matched to the current components.
const { chromium } = require('playwright');

const BASE = process.env.PW_BASE_URL || 'http://localhost:3000';

// The composer is an <input>, not a <textarea>.
const COMPOSER = 'input[placeholder="Write a message... (type @ai to query bot)"]';
// The send button only renders once the composer has content.
const SEND_BUTTON = 'button[title="Send Message (Enter)"]';
// Scopes selectors to the auth modal, avoiding the page-level
// "Sign In / Select Account" button behind it.
const AUTH_MODAL = 'div.backdrop-blur-md';

const failures = [];
const consoleErrors = new Map();

function watchErrors(page, name) {
    const errors = [];
    consoleErrors.set(name, errors);
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (text.includes('React DevTools') || text.includes('favicon')) return;
        errors.push(text);
    });
    page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
    if (process.env.PW_DEBUG_DUMP) {
        page.on('requestfailed', (req) =>
            errors.push(`requestfailed: ${req.method()} ${req.url()} ${req.failure()?.errorText}`)
        );
        page.on('websocket', (ws) => {
            ws.on('close', () => console.log(`     [ws ${name}] closed`));
            ws.on('socketerror', (e) => console.log(`     [ws ${name}] socketerror ${e}`));
        });
    }
}

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
    const usernameField = modal.locator('input[placeholder="Username (e.g. alice or bob)"]');
    await usernameField.waitFor({ timeout: 25000 });
    await usernameField.fill(username);
    await modal.locator('input[placeholder="Password"]').fill('password123');
    // The "Sign In" tab button also matches :has-text("Sign In"), so target the
    // form's submit button specifically.
    await modal.locator('form button[type="submit"]').click();

    // Reaching the composer means /auth/me resolved and a chat was selected.
    await page.waitForSelector(COMPOSER, { timeout: 30000 });
}

async function sendMessage(page, body) {
    // The composer is remounted when the active chat changes (e.g. right after
    // creating a group), so filling it too early can drop the value and the
    // send button then never renders. Wait for both, then click.
    await page.waitForSelector(COMPOSER, { timeout: 20000 });
    await page.fill(COMPOSER, body);
    await page.waitForSelector(SEND_BUTTON, { timeout: 15000 });
    await page.click(SEND_BUTTON);
    // The composer clearing is the client's own signal that it accepted the send.
    // Asserting it separately distinguishes "the app swallowed the message" from
    // "the message was sent but did not render", which a bare timeout cannot.
    await page.waitForFunction(
        (sel) => {
            const el = document.querySelector(sel);
            return !!el && el.value === '';
        },
        COMPOSER,
        { timeout: 10000 }
    );
    await page.waitForSelector(`text=${body}`, { timeout: 15000 });
}

(async () => {
    const browser = await chromium.launch(
        process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}
    );
    const ctxAlice = await browser.newContext();
    const ctxBob = await browser.newContext();
    const alice = await ctxAlice.newPage();
    const bob = await ctxBob.newPage();
    watchErrors(alice, 'alice');
    watchErrors(bob, 'bob');

    const stamp = Date.now();
    const groupName = `Test Group ${stamp}`;

    try {
        console.log('--- sign-in (AuthModal) ---');
        await login(alice, 'alice');
        await login(bob, 'bob');
        check('Alice signed in through the auth modal', true);
        check('Bob signed in through the auth modal', true);

        // Let both sockets complete auth:handshake before asserting fan-out.
        await alice.waitForTimeout(2000);

        console.log('\n--- Alice -> Bob direct message ---');
        await alice.click('text=Bob Vance', { timeout: 15000 });
        await alice.waitForSelector(COMPOSER, { timeout: 15000 });
        const directA = `hello from alice ${stamp}`;
        await sendMessage(alice, directA);
        check('Alice renders her own message', true);

        await bob.waitForSelector(`text=${directA}`, { timeout: 25000 });
        check('Bob receives the direct message over the socket', true);

        console.log('\n--- Bob -> Alice direct message ---');
        await bob.click('text=Alice Walker', { timeout: 15000 });
        await bob.waitForSelector(COMPOSER, { timeout: 15000 });
        const directB = `hello from bob ${stamp}`;
        await sendMessage(bob, directB);
        await alice.waitForSelector(`text=${directB}`, { timeout: 25000 });
        check('Alice receives the reply over the socket', true);

        console.log('\n--- group creation ---');
        // The "Create Group / Channel" button only renders in the empty state;
        // once a chat is open the entry point is the ChatList icon button.
        await alice.click('button[title="New Group / Channel"]');
        const form = alice.locator('form');
        await form.locator('input[type="text"]').first().waitFor({ timeout: 15000 });
        await form.locator('input[type="text"]').first().fill(groupName);
        // Pick Bob from the member list (rows are divs, not inputs).
        await form.locator('text=Bob Vance').first().click();
        await form.locator('button[type="submit"]').click();
        await alice.waitForSelector(COMPOSER, { timeout: 20000 });
        check('Group created and opened', true);

        console.log('\n--- group message fan-out to the other member ---');
        const groupMsg = `group hello ${stamp}`;
        await sendMessage(alice, groupMsg);
        // Bob's client sees a message for an unknown chat and refetches its
        // chat list, so the new group should appear without a manual reload.
        await bob.waitForSelector(`text=${groupName}`, { timeout: 25000 });
        check('Bob sees the new group in his chat list', true);
        await bob.click(`text=${groupName}`);
        await bob.waitForSelector(`text=${groupMsg}`, { timeout: 20000 });
        check('Bob receives the group message', true);

        console.log('\n--- Escape key handling ---');
        await alice.keyboard.press('Escape');
        await alice.waitForTimeout(400);
        check('App still responsive after Escape', await alice.isVisible(COMPOSER));

        console.log('\n--- idle stability (no runaway reconnect / listener churn) ---');
        await alice.waitForTimeout(3000);
        check('Composer still usable after idle period', await alice.isVisible(COMPOSER));
    } catch (err) {
        check('scenario completed without throwing', false, err.message);
        const at = (err.stack || '').split('\n').find((l) => l.includes('test-twine.spec.js'));
        if (at) console.log('     at' + at.split('test-twine.spec.js')[1]);
        if (process.env.PW_DEBUG_DUMP) {
            try {
                console.log('     alice URL: ' + alice.url());
                console.log('     composer visible: ' + (await alice.isVisible(COMPOSER)));
                console.log('     alice body: ' + (await alice.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600));
                console.log('     bob body: ' + (await bob.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 600));
            } catch (e) {
                console.log('     dump failed: ' + e.message);
            }
        }
    } finally {
        console.log('\n--- console/page errors ---');
        for (const [name, errors] of consoleErrors.entries()) {
            check(
                `${name} produced no console/page errors`,
                errors.length === 0,
                errors.slice(0, 5).join(' | ')
            );
        }
        await ctxAlice.close();
        await ctxBob.close();
        await browser.close();
    }

    if (failures.length === 0) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    }
    console.log(`\n❌ ${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
})();
