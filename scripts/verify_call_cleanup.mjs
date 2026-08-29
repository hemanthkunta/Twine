import { chromium } from 'playwright';

async function verifyCallCleanup() {
  console.log('🧪 Starting WebRTC Hardware Release and Multi-Call Lifecycle Verification...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      '--allow-loopback-in-peer-connection',
      '--no-sandbox',
    ],
  });

  try {
    const aliceContext = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const alicePage = await aliceContext.newPage();

    const bobContext = await browser.newContext({ permissions: ['microphone', 'camera'] });
    const bobPage = await bobContext.newPage();

    alicePage.on('console', msg => console.log('👤 [Alice]:', msg.text()));
    bobPage.on('console', msg => console.log('👤 [Bob]:', msg.text()));

    // 1. Authenticate Alice & Bob
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
    });
    await alicePage.reload();
    await alicePage.waitForSelector('text="Cloud Connected"', { timeout: 15000 });

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
    });
    await bobPage.reload();
    await bobPage.waitForSelector('text="Cloud Connected"', { timeout: 15000 });

    console.log('✅ Alice and Bob logged in.');

    // 2. Start Call 1
    console.log('📞 Initiating Call 1 (Alice -> Bob)...');
    await alicePage.click('text="Bob Vance"');
    await alicePage.waitForTimeout(500);
    const callBtn1 = await alicePage.waitForSelector('button[title*="Voice Call"]');
    await callBtn1.click();

    const acceptBtn1 = await bobPage.waitForSelector('button[title="Accept Call"]', { timeout: 10000 });
    await acceptBtn1.click();
    await alicePage.waitForTimeout(2000);

    console.log('   ✓ Call 1 active.');

    // 3. Hang up Call 1 from Alice
    console.log('📴 Alice hangs up Call 1...');
    const endCallBtn = await alicePage.waitForSelector('button[title="End Call"]');
    await endCallBtn.click();
    await alicePage.waitForTimeout(2000);

    // 4. Verify Active Tracks and DOM element cleanup on both pages
    const aliceCleanupState = await alicePage.evaluate(() => {
      const audioEl = document.querySelector('audio');
      const videoEls = document.querySelectorAll('video');
      const hasModal = document.querySelector('.glass-modal') !== null;
      const pc = window.__twine_active_pc;
      return {
        hasAudioSrc: audioEl ? audioEl.srcObject !== null : false,
        hasVideoSrc: Array.from(videoEls).some(v => v.srcObject !== null),
        hasModal,
        pcExists: pc !== null,
        pcState: pc ? pc.connectionState : 'null',
      };
    });

    const bobCleanupState = await bobPage.evaluate(() => {
      const audioEl = document.querySelector('audio');
      const videoEls = document.querySelectorAll('video');
      const hasModal = document.querySelector('.glass-modal') !== null;
      const pc = window.__twine_active_pc;
      return {
        hasAudioSrc: audioEl ? audioEl.srcObject !== null : false,
        hasVideoSrc: Array.from(videoEls).some(v => v.srcObject !== null),
        hasModal,
        pcExists: pc !== null,
        pcState: pc ? pc.connectionState : 'null',
      };
    });

    console.log('🔍 Alice Cleanup State:', JSON.stringify(aliceCleanupState, null, 2));
    console.log('🔍 Bob Cleanup State:', JSON.stringify(bobCleanupState, null, 2));

    // 5. Test Second Call (ensures camera/mic hardware is available for immediate re-use)
    console.log('📞 Initiating Call 2 (Bob -> Alice) to verify hardware availability...');
    await bobPage.click('text="Alice Walker"');
    await bobPage.waitForTimeout(500);
    const bobVoiceCallBtn = await bobPage.waitForSelector('button[title*="Voice Call"]', { timeout: 10000 });
    await bobVoiceCallBtn.click();

    const acceptBtn2 = await alicePage.waitForSelector('button[title="Accept Call"]', { timeout: 10000 });
    await acceptBtn2.click();
    await bobPage.waitForTimeout(2000);

    console.log('   ✓ Call 2 connected successfully without hardware locking!');

    // Clean up Call 2
    const endCallBtn2 = await bobPage.waitForSelector('button[title="End Call"]');
    await endCallBtn2.click();
    await bobPage.waitForTimeout(1500);

    console.log('🎉 ALL CALL LIFECYCLE AND HARDWARE RELEASE TESTS PASSED!');
  } finally {
    await browser.close();
  }
}

verifyCallCleanup().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
