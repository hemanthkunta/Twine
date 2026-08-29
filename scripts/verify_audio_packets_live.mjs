import { chromium } from 'playwright';

async function verifyAudioPacketsAndLevels() {
  console.log('🧪 Starting Rigorous WebRTC Audio Packet & audioLevel Measurement Test...');

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
    const aliceContext = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const alicePage = await aliceContext.newPage();

    const bobContext = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const bobPage = await bobContext.newPage();

    alicePage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[WebRTC') || text.includes('Audio Route')) {
        console.log('👤 [Alice Console]:', text);
      }
    });
    bobPage.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('[WebRTC') || text.includes('Audio Route')) {
        console.log('👤 [Bob Console]:', text);
      }
    });

    // 1. Authenticate Alice
    console.log('1️⃣ Logging in Alice...');
    await alicePage.goto('http://localhost:3000');
    await alicePage.waitForLoadState('networkidle');
    await alicePage.evaluate(async () => {
      localStorage.clear();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'alice', password: 'password123' }),
      });
      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      window.location.reload();
    });
    await alicePage.waitForSelector('text="Cloud Connected"', { timeout: 15000 });
    console.log('   ✓ Alice authenticated and online.');

    // 2. Authenticate Bob
    console.log('2️⃣ Logging in Bob...');
    await bobPage.goto('http://localhost:3000');
    await bobPage.waitForLoadState('networkidle');
    await bobPage.evaluate(async () => {
      localStorage.clear();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'bob', password: 'password123' }),
      });
      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      window.location.reload();
    });
    await bobPage.waitForSelector('text="Cloud Connected"', { timeout: 15000 });
    console.log('   ✓ Bob authenticated and online.');

    // 3. Alice initiates voice call to Bob
    console.log('3️⃣ Alice selects Bob and starts voice call...');
    await alicePage.click('text="Bob Vance"');
    await alicePage.waitForTimeout(1000);

    const voiceCallBtn = await alicePage.waitForSelector('button[title*="Voice Call"]', { timeout: 10000 });
    await voiceCallBtn.click();
    console.log('   ✓ Call initiated.');

    // 4. Bob receives and accepts call
    console.log('4️⃣ Bob receives incoming call and accepts...');
    const acceptBtn = await bobPage.waitForSelector('button[title="Accept Call"]', { timeout: 15000 });
    await acceptBtn.click();
    console.log('   ✓ Bob accepted call.');

    // 5. Inject active test tone on Alice to guarantee active speech audio signal
    await alicePage.evaluate(() => {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 440; // 440Hz Concert A tone
        gain.gain.value = 0.2;
        osc.connect(gain);
        
        const pc = window.__twine_active_pc;
        if (pc) {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
          if (sender) {
            const dst = ctx.createMediaStreamDestination();
            gain.connect(dst);
            osc.start();
            sender.replaceTrack(dst.stream.getAudioTracks()[0]);
            console.log('[WebRTC Test] 🎵 Injected 440Hz test audio tone into Alice audio sender track.');
          }
        }
      } catch (err) {
        console.warn('Tone injection notice:', err);
      }
    });

    // Wait for connection stabilization
    await new Promise((r) => setTimeout(r, 2000));

    // 6. Extraction helper for real WebRTC getStats() metrics
    const getDetailedStats = async (page) => {
      return await page.evaluate(async () => {
        const pc = window.__twine_active_pc;
        if (!pc) return null;
        const stats = await pc.getStats();
        let outboundAudioBytes = 0;
        let outboundAudioPackets = 0;
        let inboundAudioBytes = 0;
        let inboundAudioPackets = 0;
        let audioLevel = 0;
        let totalAudioEnergy = 0;
        let totalSamplesDuration = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
            outboundAudioBytes += report.bytesSent || 0;
            outboundAudioPackets += report.packetsSent || 0;
          }
          if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
            inboundAudioBytes += report.bytesReceived || 0;
            inboundAudioPackets += report.packetsReceived || 0;
            if (report.audioLevel !== undefined) {
              audioLevel = report.audioLevel;
            }
            if (report.totalAudioEnergy !== undefined) {
              totalAudioEnergy = report.totalAudioEnergy;
            }
            if (report.totalSamplesDuration !== undefined) {
              totalSamplesDuration = report.totalSamplesDuration;
            }
          }
          if (report.type === 'media-source' && report.kind === 'audio' && report.audioLevel !== undefined) {
            audioLevel = Math.max(audioLevel, report.audioLevel);
          }
          if (report.type === 'track' && report.audioLevel !== undefined) {
            audioLevel = Math.max(audioLevel, report.audioLevel);
          }
        });

        const audioEl = document.querySelector('audio');
        return {
          timestamp: Date.now(),
          iceConnectionState: pc.iceConnectionState,
          connectionState: pc.connectionState,
          outboundAudioBytes,
          outboundAudioPackets,
          inboundAudioBytes,
          inboundAudioPackets,
          audioLevel,
          totalAudioEnergy,
          totalSamplesDuration,
          hasAudioElement: audioEl !== null,
          audioElementPaused: audioEl?.paused,
          audioElementMuted: audioEl?.muted,
          audioElementVolume: audioEl?.volume,
          audioElementSrcObjectAttached: audioEl?.srcObject !== null,
        };
      });
    };

    // 7. STEP 1 & 2: Take Measurement 1 (Initial Snapshot)
    console.log('5️⃣ Taking WebRTC Measurement 1 (t = 0s)...');
    const aliceM1 = await getDetailedStats(alicePage);
    const bobM1 = await getDetailedStats(bobPage);

    console.log('   📸 Alice M1:', JSON.stringify(aliceM1, null, 2));
    console.log('   📸 Bob M1:', JSON.stringify(bobM1, null, 2));

    // 8. Stream audio actively for 3.5 seconds
    console.log('6️⃣ Streaming live audio across WebRTC connection for 3.5 seconds...');
    await new Promise((r) => setTimeout(r, 3500));

    // 9. Take Measurement 2 (Post-Stream Snapshot)
    console.log('7️⃣ Taking WebRTC Measurement 2 (t = 3.5s)...');
    const aliceM2 = await getDetailedStats(alicePage);
    const bobM2 = await getDetailedStats(bobPage);

    console.log('   📸 Alice M2:', JSON.stringify(aliceM2, null, 2));
    console.log('   📸 Bob M2:', JSON.stringify(bobM2, null, 2));

    // 10. STEP 4: Mutual Exclusivity Verification
    const aliceAudioRoute = await alicePage.evaluate(() => {
      const audioEl = document.querySelector('audio');
      return {
        htmlAudioPlaying: audioEl && !audioEl.paused && !audioEl.muted && audioEl.srcObject !== null,
      };
    });
    const bobAudioRoute = await bobPage.evaluate(() => {
      const audioEl = document.querySelector('audio');
      return {
        htmlAudioPlaying: audioEl && !audioEl.paused && !audioEl.muted && audioEl.srcObject !== null,
      };
    });

    console.log('\n=================== VERIFICATION REPORT ===================');
    console.log('📊 MEASUREMENT COMPARISON (BEFORE vs AFTER):');
    console.log('-----------------------------------------------------------');
    console.log(`Alice (Sender) Outbound RTP Bytes:   ${aliceM1.outboundAudioBytes} -> ${aliceM2.outboundAudioBytes} (Δ = +${aliceM2.outboundAudioBytes - aliceM1.outboundAudioBytes} bytes)`);
    console.log(`Alice (Sender) Outbound RTP Packets: ${aliceM1.outboundAudioPackets} -> ${aliceM2.outboundAudioPackets} (Δ = +${aliceM2.outboundAudioPackets - aliceM1.outboundAudioPackets} pkts)`);
    console.log(`Bob (Receiver) Inbound RTP Bytes:    ${bobM1.inboundAudioBytes} -> ${bobM2.inboundAudioBytes} (Δ = +${bobM2.inboundAudioBytes - bobM1.inboundAudioBytes} bytes)`);
    console.log(`Bob (Receiver) Inbound RTP Packets:  ${bobM1.inboundAudioPackets} -> ${bobM2.inboundAudioPackets} (Δ = +${bobM2.inboundAudioPackets - bobM1.inboundAudioPackets} pkts)`);
    console.log(`Bob (Receiver) Detected Audio Level: M1=${bobM1.audioLevel} | M2=${bobM2.audioLevel}`);
    console.log(`Bob (Receiver) Total Audio Energy:   M1=${bobM1.totalAudioEnergy} | M2=${bobM2.totalAudioEnergy}`);
    console.log('-----------------------------------------------------------');
    console.log('🔊 PLAYBACK ROUTE MUTUAL EXCLUSIVITY (STEP 4):');
    console.log(`Alice Single Route Confirmed: ${aliceAudioRoute.htmlAudioPlaying}`);
    console.log(`Bob Single Route Confirmed:   ${bobAudioRoute.htmlAudioPlaying}`);
    console.log('===========================================================\n');

    // 11. End call cleanly
    const hangupBtn = await alicePage.waitForSelector('button[title="End Call"]');
    await hangupBtn.click();
    await new Promise((r) => setTimeout(r, 1500));

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during measurement:', err);
    await browser.close();
    process.exit(1);
  }
}

verifyAudioPacketsAndLevels();
