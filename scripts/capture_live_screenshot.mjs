import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACTS_DIR = '/Users/hemanthkunta/.gemini/antigravity-ide/brain/4857bf6b-7168-49fd-ac8d-72eb47b8f80a';

async function capture() {
  console.log('🚀 Launching Google Chrome directly from system...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  console.log('🌐 Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

  // 1. Capture Login Modal View
  console.log('📸 Capturing login modal...');
  const loginScreenshotPath = path.join(ARTIFACTS_DIR, 'live_login_modal.png');
  await page.screenshot({ path: loginScreenshotPath, fullPage: true });
  console.log('   ✓ Saved login modal screenshot to:', loginScreenshotPath);

  // 2. Perform Login as Alice
  console.log('🔑 Logging in as Alice...');
  await page.fill('input[placeholder*="Username (e.g."]', 'alice');
  await page.fill('input[placeholder="Password"]', 'password123');
  await page.click('button[type="submit"]');

  // Wait for main chat header to render
  await page.waitForSelector('header', { timeout: 8000 });
  await page.waitForTimeout(2000); // Allow render settlement

  // 3. Capture Main Authenticated Chat Layout
  console.log('📸 Capturing main authenticated layout...');
  const chatScreenshotPath = path.join(ARTIFACTS_DIR, 'live_main_chat_no_banners.png');
  await page.screenshot({ path: chatScreenshotPath, fullPage: true });
  console.log('   ✓ Saved main chat screenshot to:', chatScreenshotPath);

  // 4. Dump Rendered DOM Header Area
  const headerHtml = await page.$eval('header', el => el.outerHTML).catch(() => 'No header found');
  const bodyText = await page.$eval('body', el => el.innerText).catch(() => '');
  
  console.log('\n--- Live Rendered Header HTML ---');
  console.log(headerHtml);

  console.log('\n--- Checking for Banners in Rendered Text ---');
  const hasPushBanner = bodyText.includes('Enable Push Notifications');
  const hasAndroidBanner = bodyText.includes('Install Twine Android App');
  console.log('Has "Enable Push Notifications":', hasPushBanner);
  console.log('Has "Install Twine Android App":', hasAndroidBanner);

  await browser.close();
  console.log('\n✅ Verification Complete!');
}

capture().catch(err => {
  console.error('❌ Error during capture:', err);
  process.exit(1);
});
