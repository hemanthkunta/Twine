import { chromium } from 'playwright';

async function dumpStats() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-webrtc-hide-local-ips-with-mdns',
      '--allow-loopback-in-peer-connection',
      '--no-sandbox',
    ],
  });

  const cAlice = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const cBob = await browser.newContext({ permissions: ['microphone', 'camera'] });
  const pAlice = await cAlice.newPage();
  const pBob = await cBob.newPage();

  await pAlice.goto('http://localhost:3000');
  await pAlice.waitForLoadState('networkidle');
  await pAlice.evaluate(async () => {
    localStorage.clear();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'alice', password: 'password123' }),
    });
    const data = await res.json();
    localStorage.setItem('auth_token', data.token);
  });
  await pAlice.reload();
  await pAlice.waitForSelector('text=Cloud Connected');

  await pBob.goto('http://localhost:3000');
  await pBob.waitForLoadState('networkidle');
  await pBob.evaluate(async () => {
    localStorage.clear();
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'bob', password: 'password123' }),
    });
    const data = await res.json();
    localStorage.setItem('auth_token', data.token);
  });
  await pBob.reload();
  await pBob.waitForSelector('text=Cloud Connected');

  await pAlice.click('text=Bob Vance');
  await pAlice.waitForTimeout(1000);
  const btn = await pAlice.waitForSelector('button[title*="Audio Call"], button[title*="Voice Call"], button:has(.lucide-phone)');
  await btn.click();

  await pBob.waitForSelector('button[title="Accept Call"]', { timeout: 10000 });
  await pBob.click('button[title="Accept Call"]');

  await pAlice.waitForSelector('text=Connected');
  await pBob.waitForSelector('text=Connected');

  await pAlice.waitForTimeout(4000);

  const rawReports = await pAlice.evaluate(async () => {
    const pc = window.__twine_active_pc;
    const stats = await pc.getStats();
    const list = [];
    stats.forEach((r) => list.push({ type: r.type, id: r.id, kind: r.kind, ...r }));
    return list;
  });

  console.log('ALL ALICE RAW STATS:');
  rawReports.forEach((r) => {
    if (r.bytesSent !== undefined || r.bytesReceived !== undefined || r.type === 'outbound-rtp' || r.type === 'inbound-rtp' || r.type === 'candidate-pair' || r.type === 'transport') {
      console.log(r);
    }
  });

  await browser.close();
}

dumpStats().catch(console.error);
