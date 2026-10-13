// Live E2EE probe: verifies the sealed message flow end to end.
// 1. Alice + Bob log in (demo accounts) in separate browser contexts.
// 2. Alice sends a unique secret text to Bob.
// 3. Check Bob's DOM (live WS path), the DB row (server storage), and Bob's
//    history after reload (formatMessageRow path).
import { chromium } from 'playwright';
import { DatabaseSync } from 'node:sqlite';

const APP = 'http://localhost:3000';
const secret = `E2EE-probe-${Math.floor(Math.random() * 1e6)}`;

const browser = await chromium.launch();

const SELECTORS = {
  usernameInput: 'input[placeholder="Username (e.g. alice or bob)"]',
  passwordInput: 'input[placeholder="Password"]',
  signInButton: 'button[type="submit"]:has-text("Sign In")',
  composer: 'input[placeholder="Write a message... (type @ai to query bot)"]',
  chatList: 'aside',
};

async function loginAs(user) {
  const ctx = await browser.newContext();
  // Capture WS payloads: record the exact ciphertext sent / received per side.
  await ctx.addInitScript(() => {
    window.__wsCapture = { sent: [], recv: [] };
    const OrigSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        const frame = JSON.parse(data);
        if (frame.type === 'chat:send_message' && frame.payload?.ciphertext_payload) {
          window.__wsCapture.sent.push(frame.payload.ciphertext_payload);
        }
      } catch {}
      return OrigSend.call(this, data);
    };
  });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log(`[${user.toUpperCase()}][log]`, m.text()));
  await page.goto(APP);
  // Mirror tests/agents/base.ts login flow: fill username/password, click Sign In.
  await page.locator(SELECTORS.usernameInput).fill(user);
  await page.locator(SELECTORS.passwordInput).fill('password123');
  await page.locator(SELECTORS.signInButton).click();
  // Wait for the app shell (chat list aside), then WS connect + identity publish.
  await page.locator(SELECTORS.chatList).waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(3500); // allow WS connect + identity publish
  console.log(`LOGIN: ${user} ok`);
  return { ctx, page };
}

try {
  const alice = await loginAs('alice');
  const bob = await loginAs('bob');

  // INSTRUMENTATION: run the real sealForChat path inside Alice's page.
  const dbg = await alice.page.evaluate(async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    const res = await fetch('http://localhost:4000/api/chats', { headers });
    const { chats } = await res.json();
    const chat = chats.find((c) => c.type === 'DIRECT' && c.peer_user?.id === 'usr_bob_002');
    if (!chat) return { error: 'no DIRECT chat with bob found', chatTypes: chats.map((c) => c.type) };
    const { E2EEService } = await import('/src/services/e2ee.ts');
    const out = {
      chatId: chat.id,
      chatType: chat.type,
      peerUserId: chat.peer_user?.id ?? null,
      isSavedMessages: chat.is_saved_messages ?? null,
      isSealable: E2EEService.isSealable(chat),
      canSeal: E2EEService.canSeal(chat),
    };
    out.peerKey = await E2EEService.getPeerKey('usr_bob_002').then((k) => (k ? k.slice(0, 24) : null));
    out.sealResult = await E2EEService.sealForChat('dbg-text', chat, 'usr_alice_001').then(
      (s) => (s ? s.slice(0, 24) : null)
    );
    return out;
  });
  console.log(`DEBUG: ${JSON.stringify(dbg)}`);

  // Bob opens Alice's chat first so the live message renders in view.
  await bob.page.locator('aside').getByText('Alice Walker', { exact: true }).first().click({ timeout: 10000 });
  await bob.page.locator(SELECTORS.composer).waitFor({ state: 'visible', timeout: 10000 });
  await bob.page.waitForTimeout(500);
  const bubblesBefore = await bob.page.locator('.msg-bubble').count();
  console.log(`SETUP: bob opened alice chat, bubblesBefore=${bubblesBefore}`);

  // Alice opens the chat with Bob and sends the secret.
  await alice.page.getByText('Bob Vance', { exact: true }).first().click();
  await alice.page.waitForTimeout(1000);
  await alice.page.getByPlaceholder(/message|type/i).first().fill(secret);
  await alice.page.keyboard.press('Enter');
  await alice.page.waitForTimeout(4000);

  // Helper: classify what a page currently shows about the probe message.
  async function classifyBob() {
    return await bob.page.evaluate((s) => {
      const bubbles = Array.from(document.querySelectorAll('.msg-bubble'));
      const lastBubble = bubbles.length ? bubbles[bubbles.length - 1].textContent || '' : '';
      const body = document.body.innerText;
      return {
        lastBubbleHasSecret: lastBubble.includes(s),
        lastBubblePreview: lastBubble.slice(0, 80),
        bubbleCount: bubbles.length,
        bodyHasSecret: body.includes(s),
        bodyHasCipherJson: body.includes('{"v":'),
      };
    }, secret);
  }

  // (a) LIVE PATH: wait until Bob's DOM settles on one of the outcomes.
  await bob.page.waitForTimeout(1500);
  const live = await classifyBob();
  console.log(`LIVE: ${JSON.stringify(live)}`);
  const aliceHasCipher = await alice.page.evaluate((s) => {
    const body = document.body.innerText;
    return { hasSecret: body.includes(s), hasCipherJson: body.includes('{"v":') };
  }, secret);
  console.log(`LIVE-ALICE: ${JSON.stringify(aliceHasCipher)}`);

  // CRYPTO-DEBUG: compare each side's in-memory public key with the directory,
  // and attempt a targeted decrypt of the stored envelope from Bob's page.
  async function cryptoDebug(page, userId, peerId, ciphertext) {
    return await page.evaluate(async ({ userId, peerId, ciphertext }) => {
      const { CryptoService } = await import('/src/services/crypto.ts');
      const token = localStorage.getItem('auth_token');
      const headers = { Authorization: `Bearer ${token}` };
      const peerKeyRes = await fetch(`http://localhost:4000/api/keys/${peerId}`, { headers });
      const dirPeerKey = peerKeyRes.ok ? (await peerKeyRes.json()).public_key : null;
      const myKeyRes = await fetch(`http://localhost:4000/api/keys/${userId}`, { headers });
      const dirMyKey = myKeyRes.ok ? (await myKeyRes.json()).public_key : null;
      const memMyKey = CryptoService.getPublicKey();
      // Experiment 1: self round-trip (own pub key) — validates the crypto chain.
      let selfRoundTrip = 'skipped';
      try {
        const env = await CryptoService.sealForPeer('rt-self', memMyKey);
        const back = await CryptoService.openFromPeer(env, memMyKey);
        selfRoundTrip = back === 'rt-self' ? 'OK' : `MISMATCH:${back}`;
      } catch (e) {
        selfRoundTrip = `THROW:${String(e).slice(0, 50)}`;
      }
      // Experiment 2: seal to the peer's directory key, re-open in the SAME page.
      let peerRoundTrip = 'skipped';
      try {
        const env2 = await CryptoService.sealForPeer('rt-peer', dirPeerKey);
        const back2 = await CryptoService.openFromPeer(env2, dirPeerKey);
        peerRoundTrip = back2 === 'rt-peer' ? 'OK' : `MISMATCH:${back2}`;
      } catch (e) {
        peerRoundTrip = `THROW:${String(e).slice(0, 50)}`;
      }
      let decryptOk = false;
      let decryptErr = '';
      try {
        const plain = await CryptoService.openFromPeer(ciphertext, dirPeerKey);
        decryptOk = typeof plain === 'string' && plain.length > 0;
      } catch (e) {
        decryptErr = String(e);
      }
      return {
        hasIdentity: CryptoService.hasIdentityKey(),
        memKeyEqualsDir: memMyKey === dirMyKey,
        memKeyPrefix: memMyKey.slice(0, 20),
        dirKeyPrefix: (dirMyKey || '').slice(0, 20),
        selfRoundTrip,
        peerRoundTrip,
        decryptOk,
        decryptErr: decryptErr.slice(0, 80),
      };
    }, { userId, peerId, ciphertext });
  }

  // (b) SERVER STORAGE: find the row in messages.
  const db = new DatabaseSync('messaging.db');
  const row = db.prepare(
    "SELECT id, content_text, ciphertext_payload FROM messages ORDER BY created_at DESC LIMIT 1"
  ).get();
  const ct = row.ciphertext_payload;
  console.log(`DB: content_text=${JSON.stringify((row.content_text || '').slice(0, 60))}`);
  console.log(`DB: ciphertext_payload=${ct ? ct.slice(0, 60) + '...' : 'NULL'}`);
  console.log(`DB: sealed=${!!ct && ct.includes('"v"')} contentBlank=${!row.content_text}`);
  db.close();

  if (ct) {
    // HOP COMPARISON: did the exact bytes Alice sent survive into the DB?
    const sentEnvelopes = await alice.page.evaluate(() => window.__wsCapture?.sent ?? []);
    const lastSent = sentEnvelopes[sentEnvelopes.length - 1] || null;
    console.log(`WS: sentCount=${sentEnvelopes.length} wsEqualsDb=${lastSent === ct}`);
    console.log(`WS: sentPrefix=${(lastSent || '').slice(0, 50)}`);
    console.log(`WS: dbPrefix=${ct.slice(0, 50)}`);
    const envToOpen = lastSent || ct;
    const bobDbg = await cryptoDebug(bob.page, 'usr_bob_002', 'usr_alice_001', envToOpen);
    console.log(`CRYPTO-DEBUG-BOB: ${JSON.stringify(bobDbg)}`);
    const aliceDbg = await cryptoDebug(alice.page, 'usr_alice_001', 'usr_bob_002', envToOpen);
    console.log(`CRYPTO-DEBUG-ALICE: ${JSON.stringify(aliceDbg)}`);
  }

  // (c) HISTORY PATH: reload Bob's page and see what renders from the DB.
  await bob.page.reload();
  await bob.page.locator('aside').waitFor({ state: 'visible', timeout: 30000 });
  await bob.page.waitForTimeout(3000); // allow session resume + history decrypt
  await bob.page.getByText('Alice Walker', { exact: true }).first().click({ timeout: 5000 }).catch(() => {});
  await bob.page.waitForTimeout(2500);
  const history = await classifyBob();
  console.log(`HISTORY: ${JSON.stringify(history)}`);

  const livePass = live.lastBubbleHasSecret || live.bodyHasSecret;
  const histPass = history.lastBubbleHasSecret || history.bodyHasSecret;
  const verdict =
    livePass && histPass && ct && row.content_text === ''
      ? 'PASS: sealed by default, server stores only ciphertext, both paths decrypt'
      : `FAILURE DETECTED — livePass=${livePass} histPass=${histPass} sealed=${!!ct} lastBubble="${history.lastBubblePreview}"`;
  console.log(`\nVERDICT: ${verdict}`);

  await alice.ctx.close();
  await bob.ctx.close();
} catch (err) {
  console.error('PROBE ERROR:', err);
} finally {
  await browser.close();
}
