import { chromium } from 'playwright';

async function runVerification() {
  console.log('🧪 Starting WebRTC getStats() Delta Byte & Frame Verification...');

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

  try {
    const contextAlice = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const contextBob = await browser.newContext({ permissions: ['microphone', 'camera'] });

    const pageAlice = await contextAlice.newPage();
    const pageBob = await contextBob.newPage();

    // 1. Log in Alice
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

    // 2. Log in Bob
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

    // 3. Alice initiates voice call
    await pageAlice.click('text=Bob Vance');
    await pageAlice.waitForTimeout(1000);
    const callButton = await pageAlice.waitForSelector('button[title*="Audio Call"], button[title*="Voice Call"], button:has(.lucide-phone)');
    await callButton.click();

    // 4. Bob accepts
    await pageBob.waitForSelector('button[title="Accept Call"]', { timeout: 10000 });
    await pageBob.click('button[title="Accept Call"]');

    await pageAlice.waitForSelector('text=Connected', { timeout: 10000 });
    await pageBob.waitForSelector('text=Connected', { timeout: 10000 });

    // Helper to extract Audio & Video stats from RTCPeerConnection
    async function extractStats(page) {
      return await page.evaluate(async () => {
        const pc = window.__twine_active_pc;
        if (!pc) return null;
        const stats = await pc.getStats();
        const res = {
          audio: {
            outbound: { bytesSent: 0, packetsSent: 0 },
            inbound: { bytesReceived: 0, packetsReceived: 0, audioLevel: 0 },
          },
          video: {
            outbound: { bytesSent: 0, packetsSent: 0, framesSent: 0, frameWidth: 0, frameHeight: 0 },
            inbound: { bytesReceived: 0, packetsReceived: 0, framesReceived: 0, framesDecoded: 0 },
          },
        };

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'audio') {
            res.audio.outbound.bytesSent = report.bytesSent || 0;
            res.audio.outbound.packetsSent = report.packetsSent || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            res.audio.inbound.bytesReceived = report.bytesReceived || 0;
            res.audio.inbound.packetsReceived = report.packetsReceived || 0;
            res.audio.inbound.audioLevel = report.audioLevel || 0;
          }
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            res.video.outbound.bytesSent = report.bytesSent || 0;
            res.video.outbound.packetsSent = report.packetsSent || 0;
            res.video.outbound.framesSent = report.framesSent || 0;
            res.video.outbound.frameWidth = report.frameWidth || 0;
            res.video.outbound.frameHeight = report.frameHeight || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            res.video.inbound.bytesReceived = report.bytesReceived || 0;
            res.video.inbound.packetsReceived = report.packetsReceived || 0;
            res.video.inbound.framesReceived = report.framesReceived || 0;
            res.video.inbound.framesDecoded = report.framesDecoded || 0;
          }
        });
        return res;
      });
    }

    // Wait 2s for media transport pipeline to stabilize
    await pageAlice.waitForTimeout(2000);

    // ==========================================
    // STEP 2: AUDIO GETSTATS() (T1 and T2 - 3s apart)
    // ==========================================
    console.log('📊 Sampling Audio Stats at T1...');
    const audioAliceT1 = await extractStats(pageAlice);
    const audioBobT1 = await extractStats(pageBob);

    console.log('⏳ Waiting 3.5 seconds...');
    await pageAlice.waitForTimeout(3500);

    console.log('📊 Sampling Audio Stats at T2...');
    const audioAliceT2 = await extractStats(pageAlice);
    const audioBobT2 = await extractStats(pageBob);

    // ==========================================
    // STEP 3: VIDEO TOGGLE & GETSTATS() (T1 and T2 - 3s apart)
    // ==========================================
    console.log('📹 Alice enabling video camera mid-call...');
    const aliceVideoBtn = await pageAlice.waitForSelector('button[title*="Turn on camera"], button[title*="camera"]');
    await aliceVideoBtn.click();
    await pageAlice.waitForTimeout(2000);

    console.log('📊 Sampling Video Stats at T1 (post-toggle)...');
    const videoAliceT1 = await extractStats(pageAlice);
    const videoBobT1 = await extractStats(pageBob);

    console.log('⏳ Waiting 3.5 seconds for video frames to transmit and decode...');
    await pageAlice.waitForTimeout(3500);

    console.log('📊 Sampling Video Stats at T2 (post-toggle)...');
    const videoAliceT2 = await extractStats(pageAlice);
    const videoBobT2 = await extractStats(pageBob);

    console.log('\n======================================================');
    console.log('             RAW GETSTATS() VERIFICATION REPORT       ');
    console.log('======================================================\n');

    console.log('--- AUDIO STREAMING (Alice -> Bob & Bob -> Alice) ---');
    console.log('Alice (Caller):');
    console.log(`  T1 Outbound: bytesSent=${audioAliceT1.audio.outbound.bytesSent}, packetsSent=${audioAliceT1.audio.outbound.packetsSent}`);
    console.log(`  T2 Outbound: bytesSent=${audioAliceT2.audio.outbound.bytesSent}, packetsSent=${audioAliceT2.audio.outbound.packetsSent}`);
    console.log(`  Delta Outbound: +${audioAliceT2.audio.outbound.bytesSent - audioAliceT1.audio.outbound.bytesSent} bytes, +${audioAliceT2.audio.outbound.packetsSent - audioAliceT1.audio.outbound.packetsSent} packets`);
    console.log(`  T1 Inbound: bytesReceived=${audioAliceT1.audio.inbound.bytesReceived}, packetsReceived=${audioAliceT1.audio.inbound.packetsReceived}, audioLevel=${audioAliceT1.audio.inbound.audioLevel}`);
    console.log(`  T2 Inbound: bytesReceived=${audioAliceT2.audio.inbound.bytesReceived}, packetsReceived=${audioAliceT2.audio.inbound.packetsReceived}, audioLevel=${audioAliceT2.audio.inbound.audioLevel}`);
    console.log(`  Delta Inbound: +${audioAliceT2.audio.inbound.bytesReceived - audioAliceT1.audio.inbound.bytesReceived} bytes, +${audioAliceT2.audio.inbound.packetsReceived - audioAliceT1.audio.inbound.packetsReceived} packets\n`);

    console.log('Bob (Receiver):');
    console.log(`  T1 Outbound: bytesSent=${audioBobT1.audio.outbound.bytesSent}, packetsSent=${audioBobT1.audio.outbound.packetsSent}`);
    console.log(`  T2 Outbound: bytesSent=${audioBobT2.audio.outbound.bytesSent}, packetsSent=${audioBobT2.audio.outbound.packetsSent}`);
    console.log(`  Delta Outbound: +${audioBobT2.audio.outbound.bytesSent - audioBobT1.audio.outbound.bytesSent} bytes, +${audioBobT2.audio.outbound.packetsSent - audioBobT1.audio.outbound.packetsSent} packets`);
    console.log(`  T1 Inbound: bytesReceived=${audioBobT1.audio.inbound.bytesReceived}, packetsReceived=${audioBobT1.audio.inbound.packetsReceived}, audioLevel=${audioBobT1.audio.inbound.audioLevel}`);
    console.log(`  T2 Inbound: bytesReceived=${audioBobT2.audio.inbound.bytesReceived}, packetsReceived=${audioBobT2.audio.inbound.packetsReceived}, audioLevel=${audioBobT2.audio.inbound.audioLevel}`);
    console.log(`  Delta Inbound: +${audioBobT2.audio.inbound.bytesReceived - audioBobT1.audio.inbound.bytesReceived} bytes, +${audioBobT2.audio.inbound.packetsReceived - audioBobT1.audio.inbound.packetsReceived} packets\n`);

    console.log('--- VIDEO STREAMING (Alice Camera -> Bob Screen) ---');
    console.log('Alice (Video Sender):');
    console.log(`  T1 Outbound: bytesSent=${videoAliceT1.video.outbound.bytesSent}, packetsSent=${videoAliceT1.video.outbound.packetsSent}, framesSent=${videoAliceT1.video.outbound.framesSent}, resolution=${videoAliceT1.video.outbound.frameWidth}x${videoAliceT1.video.outbound.frameHeight}`);
    console.log(`  T2 Outbound: bytesSent=${videoAliceT2.video.outbound.bytesSent}, packetsSent=${videoAliceT2.video.outbound.packetsSent}, framesSent=${videoAliceT2.video.outbound.framesSent}, resolution=${videoAliceT2.video.outbound.frameWidth}x${videoAliceT2.video.outbound.frameHeight}`);
    console.log(`  Delta Outbound: +${videoAliceT2.video.outbound.bytesSent - videoAliceT1.video.outbound.bytesSent} bytes, +${videoAliceT2.video.outbound.framesSent - videoAliceT1.video.outbound.framesSent} frames\n`);

    console.log('Bob (Video Receiver):');
    console.log(`  T1 Inbound: bytesReceived=${videoBobT1.video.inbound.bytesReceived}, packetsReceived=${videoBobT1.video.inbound.packetsReceived}, framesReceived=${videoBobT1.video.inbound.framesReceived}, framesDecoded=${videoBobT1.video.inbound.framesDecoded}`);
    console.log(`  T2 Inbound: bytesReceived=${videoBobT2.video.inbound.bytesReceived}, packetsReceived=${videoBobT2.video.inbound.packetsReceived}, framesReceived=${videoBobT2.video.inbound.framesReceived}, framesDecoded=${videoBobT2.video.inbound.framesDecoded}`);
    console.log(`  Delta Inbound: +${videoBobT2.video.inbound.bytesReceived - videoBobT1.video.inbound.bytesReceived} bytes, +${videoBobT2.video.inbound.framesReceived - videoBobT1.video.inbound.framesReceived} frames received, +${videoBobT2.video.inbound.framesDecoded - videoBobT1.video.inbound.framesDecoded} frames decoded\n`);

    // Teardown
    const hangupBtn = await pageAlice.waitForSelector('button[title="End Call"]');
    await hangupBtn.click();
    await pageAlice.waitForTimeout(1000);
    console.log('✅ Call cleanly hung up and media tracks released.');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('❌ Verification script failed:', err);
  process.exit(1);
});
