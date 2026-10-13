// Live probe 2: does clicking the bouncing Accept button hang? Does End Call work?
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';

async function login(page, username) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('input[placeholder="Username (e.g. alice or bob)"]').fill(username);
  await page.locator('input[placeholder="Password"]').fill('password123');
  await page.locator('button[type="submit"]:has-text("Sign In")').click();
  await page.waitForSelector('input[placeholder="Write a message... (type @ai to query bot)"]', { timeout: 30000 });
}

const browser = await chromium.launch();
const ctxA = await browser.newContext();
const ctxB = await browser.newContext();
const alice = await ctxA.newPage();
const bob = await ctxB.newPage();

for (const [name, page] of [['ALICE', alice], ['BOB', bob]]) {
  page.on('console', (msg) => {
    const t = msg.text();
    if (/WebRTC|webrtc|Watchdog|answer|Answer|failed|Failed/.test(t)) console.log(`[${name}][${msg.type()}] ${t.slice(0, 200)}`);
  });
}

await login(alice, 'alice');
await login(bob, 'bob');

await alice.locator('aside div.cursor-pointer').getByText('Bob Vance', { exact: true }).first().click({ timeout: 15000 });
await alice.waitForSelector('input[placeholder="Write a message... (type @ai to query bot)"]', { timeout: 15000 });
await alice.locator('button[title="Voice Call (WebRTC)"]').click({ timeout: 10000 });

await bob.waitForSelector('[data-testid="incoming-call"]', { timeout: 15000 });
console.log('--- BOB sees incoming call; clicking Accept (timed 30s) ---');

const t0 = Date.now();
await bob.locator('[data-testid="incoming-call"]').locator('button:has-text("Accept")').click({ timeout: 30000 })
  .then(() => console.log(`ACCEPT click completed in ${Date.now() - t0}ms`))
  .catch((e) => console.log(`ACCEPT click FAILED after ${Date.now() - t0}ms: ${String(e).slice(0, 150)}`));

// Watch status transitions on Bob
for (let i = 0; i < 30; i++) {
  await bob.waitForTimeout(1000);
  const callModal = await bob.locator('[data-testid="call-modal"]').isVisible().catch(() => false);
  const statusText = await bob.locator('[data-testid="call-modal"] p').first().innerText().catch(() => '(n/a)');
  if (i % 5 === 0 || !callModal) console.log(`t+${i + 1}s modal=${callModal} status="${statusText}"`);
  if (!callModal) break;
}

// Click End Call on Bob's modal
const t1 = Date.now();
await bob.locator('[data-testid="call-modal"]').locator('button:has-text("End Call")').click({ timeout: 10000 })
  .then(() => console.log(`END CALL click completed in ${Date.now() - t1}ms`))
  .catch((e) => console.log(`END CALL click FAILED after ${Date.now() - t1}ms: ${String(e).slice(0, 150)}`));

const gone = await bob.locator('[data-testid="call-modal"]').isVisible().catch(() => false);
console.log('modal still visible after End Call:', gone);

await browser.close();
