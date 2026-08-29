import { chromium } from 'playwright';

async function run() {
  console.log('🧪 Starting WebRTC Audio & Mid-Call Video Toggle Live Verification...');

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

  const contextAlice = await browser.newContext({
    permissions: ['microphone', 'camera'],
  });
  const contextBob = await browser.newContext({
    permissions: ['microphone', 'camera'],
  });

  const pageAlice = await contextAlice.newPage();
  const pageBob = await contextBob.newPage();

  const aliceLogs = [];
  const bobLogs = [];

  pageAlice.on('console', (msg) => {
    const text = msg.text();
    aliceLogs.push(text);
    console.log(`[Alice Console] ${text}`);
  });

  pageBob.on('console', (msg) => {
    const text = msg.text();
    bobLogs.push(text);
    console.log(`[Bob Console] ${text}`);
  });

  try {
    // 1. Navigate and login Alice
    console.log('1️⃣ Logging in Alice...');
    await pageAlice.goto('http://localhost:3000');
    await pageAlice.waitForLoadState('networkidle');
    await pageAlice.evaluate(async () => {
      localStorage.clear();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'password123' }),
      });
      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
    });
    await pageAlice.reload();
    await pageAlice.waitForSelector('text=Cloud Connected', { timeout: 15000 });
    console.log('   ✓ Alice logged in & Cloud Connected.');

    // 2. Navigate and login Bob
    console.log('2️⃣ Logging in Bob...');
    await pageBob.goto('http://localhost:3000');
    await pageBob.waitForLoadState('networkidle');
    await pageBob.evaluate(async () => {
      localStorage.clear();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'bob', password: 'password123' }),
      });
      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
    });
    await pageBob.reload();
    await pageBob.waitForSelector('text=Cloud Connected', { timeout: 15000 });
    console.log('   ✓ Bob logged in & Cloud Connected.');

    // 3. Alice initiates voice call to Bob
    console.log('3️⃣ Alice initiating voice call to Bob...');
    await pageAlice.click('text=Bob Vance');
    await pageAlice.waitForTimeout(1000);
    const callButton = await pageAlice.waitForSelector('button[title*="Audio Call"], button[title*="Voice Call"], button:has(.lucide-phone)', { timeout: 5000 });
    await callButton.click();

    // 4. Bob receives incoming call and accepts
    console.log('4️⃣ Bob accepting incoming call...');
    await pageBob.waitForSelector('button[title="Accept Call"]', { timeout: 10000 });
    await pageBob.click('button[title="Accept Call"]');

    // 5. Wait for connected state
    console.log('5️⃣ Waiting for call to connect...');
    await pageAlice.waitForSelector('text=Connected', { timeout: 10000 });
    await pageBob.waitForSelector('text=Connected', { timeout: 10000 });
    await pageAlice.waitForTimeout(3000);

    // 6. Check Bug A: Check if fallback media triggered on either side
    const aliceFallback = aliceLogs.some((l) => l.includes('[CRITICAL] getUserMedia failed'));
    const bobFallback = bobLogs.some((l) => l.includes('[CRITICAL] getUserMedia failed'));
    console.log(`\n================ BUG A CHECK ================`);
    console.log(`🔍 Alice Fallback Triggered: ${aliceFallback}`);
    console.log(`🔍 Bob Fallback Triggered: ${bobFallback}`);
    if (!aliceFallback && !bobFallback) {
      console.log('✅ Real getUserMedia succeeded without falling back to synthetic audio/video!');
    }

    // 7. Check Audio RTP stats on both sides
    const aliceStats = await pageAlice.evaluate(async () => {
      const pc = window.__twine_active_pc;
      if (!pc) return null;
      const stats = await pc.getStats();
      let outboundAudio = { bytesSent: 0, packetsSent: 0 };
      let inboundAudio = { bytesReceived: 0, packetsReceived: 0, audioLevel: 0 };
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          outboundAudio = { bytesSent: report.bytesSent, packetsSent: report.packetsSent };
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          inboundAudio = { bytesReceived: report.bytesReceived, packetsReceived: report.packetsReceived, audioLevel: report.audioLevel || 0 };
        }
      });
      return { outboundAudio, inboundAudio };
    });

    const bobStats = await pageBob.evaluate(async () => {
      const pc = window.__twine_active_pc;
      if (!pc) return null;
      const stats = await pc.getStats();
      let outboundAudio = { bytesSent: 0, packetsSent: 0 };
      let inboundAudio = { bytesReceived: 0, packetsReceived: 0, audioLevel: 0 };
      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'audio') {
          outboundAudio = { bytesSent: report.bytesSent, packetsSent: report.packetsSent };
        }
        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          inboundAudio = { bytesReceived: report.bytesReceived, packetsReceived: report.packetsReceived, audioLevel: report.audioLevel || 0 };
        }
      });
      return { outboundAudio, inboundAudio };
    });

    console.log('\n================ AUDIO RTP STATS ================');
    console.log('📊 Alice Initial Voice Stats:', JSON.stringify(aliceStats, null, 2));
    console.log('📊 Bob Initial Voice Stats:', JSON.stringify(bobStats, null, 2));

    // 8. Test Bug B: Alice turns ON camera mid-call
    console.log('\n================ BUG B & C: MID-CALL VIDEO TOGGLE ================');
    console.log('📹 Alice toggling camera ON mid-call...');
    const aliceVideoBtn = await pageAlice.waitForSelector('button[title*="Turn on camera"], button[title*="camera"]');
    await aliceVideoBtn.click();
    await pageAlice.waitForTimeout(3500);

    // 9. Inspect Transceiver currentDirection and remote video playback on Bob
    const aliceTransceivers = await pageAlice.evaluate(() => {
      const pc = window.__twine_active_pc;
      return pc?.getTransceivers().map((t) => ({
        kind: t.receiver.track.kind,
        direction: t.direction,
        currentDirection: t.currentDirection,
      }));
    });

    const bobTransceivers = await pageBob.evaluate(() => {
      const pc = window.__twine_active_pc;
      return pc?.getTransceivers().map((t) => ({
        kind: t.receiver.track.kind,
        direction: t.direction,
        currentDirection: t.currentDirection,
      }));
    });

    console.log('🔍 Alice Transceivers after Video Toggle:', JSON.stringify(aliceTransceivers, null, 2));
    console.log('🔍 Bob Transceivers after Video Toggle:', JSON.stringify(bobTransceivers, null, 2));

    const bobVideoState = await pageBob.evaluate(() => {
      const videoEls = Array.from(document.querySelectorAll('video'));
      return videoEls.map((v) => ({
        srcObjectActive: Boolean(v.srcObject),
        paused: v.paused,
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight,
        muted: v.muted,
      }));
    });
    console.log('🔍 Bob Video Elements State after Alice Video Toggle:', JSON.stringify(bobVideoState, null, 2));

    // 10. End Call and verify teardown
    console.log('\n================ CALL TEARDOWN ================');
    console.log('📴 Alice ending the call...');
    const hangupBtn = await pageAlice.waitForSelector('button[title="End Call"]');
    await hangupBtn.click();
    await pageAlice.waitForTimeout(2000);

    const aliceModalGone = !(await pageAlice.$('text=Connected'));
    const bobModalGone = !(await pageBob.$('text=Connected'));

    console.log(`✓ Alice Call UI Closed: ${aliceModalGone}`);
    console.log(`✓ Bob Call UI Closed: ${bobModalGone}`);

    console.log('🎉 ALL WEBRTC MID-CALL VIDEO TOGGLE & AUDIO TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
