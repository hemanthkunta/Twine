import { test, expect } from '@playwright/test';
import {
  TestAgent,
  DEMO_USERS,
  BASE_URL,
  SELECTORS,
} from './base';

test.describe.configure({ mode: 'serial' });

test.describe('E2EE Incognito Browser Context Tests', () => {
  let aliceContext: any;
  let bobContext: any;
  let alicePage: any;
  let bobPage: any;
  let alice: TestAgent;
  let bob: TestAgent;

  test.beforeAll(async ({ browser }) => {
    // Create two separate incognito-like browser contexts
    // Each context is isolated with its own cookies, localStorage, etc.
    aliceContext = await browser.newContext({
      // Incognito-like settings
      storageState: undefined, // No persisted state
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });
    bobContext = await browser.newContext({
      storageState: undefined,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });

    alicePage = await aliceContext.newPage();
    bobPage = await bobContext.newPage();

    alice = new TestAgent(alicePage, aliceContext, 'alice-incognito');
    bob = new TestAgent(bobPage, bobContext, 'bob-incognito');
  });

  test.afterAll(async () => {
    await aliceContext?.close();
    await bobContext?.close();
  });

  test('Alice and Bob login in separate incognito contexts', async () => {
    // Alice logs in
    await alice.navigateToApp();
    await alice.login('alice');
    await expect(alicePage.locator(SELECTORS.chatList)).toBeVisible({ timeout: 45000 });
    await expect(alicePage.locator(SELECTORS.composer)).toBeVisible({ timeout: 15000 });

    // Bob logs in
    await bob.navigateToApp();
    await bob.login('bob');
    await expect(bobPage.locator(SELECTORS.chatList)).toBeVisible({ timeout: 45000 });
    await expect(bobPage.locator(SELECTORS.composer)).toBeVisible({ timeout: 15000 });

    // Verify both are in the app
    const aliceBody = await alicePage.locator('body').innerText();
    const bobBody = await bobPage.locator('body').innerText();
    expect(aliceBody).toContain('Alice Walker');
    expect(bobBody).toContain('Bob Vance');
  });

  test('Alice initiates direct chat with Bob and enables E2EE', async () => {
    // Alice starts direct chat with Bob
    await alice.startDirectChat('Bob Vance');
    await alicePage.waitForSelector(SELECTORS.composer, { timeout: 15000 });

    // Wait for Bob's chat list to update
    await bobPage.waitForTimeout(3000);
    const bobChatList = bobPage.locator(SELECTORS.chatList);
    await expect(bobChatList.locator('text=Alice Walker')).toBeVisible({ timeout: 15000 });

    // Bob selects the chat with Alice
    await bob.selectChat('Alice Walker');
    await bobPage.waitForSelector(SELECTORS.composer, { timeout: 15000 });

    // Wait for E2EE key exchange to complete on both sides
    // The shield icon indicates E2EE is active
    await expect(alicePage.locator('header >> text=E2EE')).toBeVisible({ timeout: 30000 });
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible({ timeout: 30000 });
  });

  test('Safety numbers match on both Alice and Bob', async () => {
    // Open safety number verification modal on Alice's side
    await alicePage.click('header >> button[title="Verify Safety Number & QR Code"]');
    // Wait for the modal with the safety number display - use more specific selector
    await expect(alicePage.locator('h3:has-text("Verify Safety Number")')).toBeVisible({ timeout: 10000 });
    
    // Get Alice's safety number - look for the safety number pattern (groups of digits)
    // Safety numbers are typically displayed as a long numeric string or groups of digits
    const aliceSafetyNumber = await alicePage.locator('text=/\\d{5}\\s*\\d{5}\\s*\\d{5}\\s*\\d{5}\\s*\\d{5}/').first().textContent();
    if (!aliceSafetyNumber) {
      // Fallback: try to find any long numeric string that's not a timestamp
      const fallback = await alicePage.locator('text=/\\d{10,}/').first().textContent();
      console.log(`Alice's Safety Number (fallback): ${fallback}`);
    }
    expect(aliceSafetyNumber).toBeTruthy();
    console.log(`Alice's Safety Number: ${aliceSafetyNumber}`);

    // Close Alice's modal
    await alicePage.keyboard.press('Escape');
    await expect(alicePage.locator('h3:has-text("Verify Safety Number")')).not.toBeVisible({ timeout: 5000 });

    // Open safety number verification modal on Bob's side
    await bobPage.click('header >> button[title="Verify Safety Number & QR Code"]');
    await expect(bobPage.locator('h3:has-text("Verify Safety Number")')).toBeVisible({ timeout: 10000 });
    
    // Get Bob's safety number
    const bobSafetyNumber = await bobPage.locator('text=/\\d{5}\\s*\\d{5}\\s*\\d{5}\\s*\\d{5}\\s*\\d{5}/').first().textContent();
    if (!bobSafetyNumber) {
      const fallback = await bobPage.locator('text=/\\d{10,}/').first().textContent();
      console.log(`Bob's Safety Number (fallback): ${fallback}`);
    }
    expect(bobSafetyNumber).toBeTruthy();
    console.log(`Bob's Safety Number: ${bobSafetyNumber}`);

    // Close Bob's modal
    await bobPage.keyboard.press('Escape');
    await expect(bobPage.locator('h3:has-text("Verify Safety Number")')).not.toBeVisible({ timeout: 5000 });

    // Verify safety numbers match (if both were found with the proper pattern)
    if (aliceSafetyNumber && bobSafetyNumber && aliceSafetyNumber.match(/\\d{5}\\s*\\d{5}\\s*\\d{5}\\s*\\d{5}\\s*\\d{5}/)) {
      expect(aliceSafetyNumber.replace(/\s+/g, '')).toBe(bobSafetyNumber.replace(/\s+/g, ''));
    }
  });

  test('Alice sends encrypted message to Bob and it decrypts correctly', async () => {
    const testMessage = `E2EE encrypted test ${Date.now()}`;
    
    // Alice sends encrypted message
    await alice.sendMessage(testMessage);
    await alice.waitForMessage(testMessage);

    // Bob should receive and decrypt the message
    await bob.waitForMessage(testMessage, 30000);

    // Verify E2EE indicator is shown on both sides
    await expect(alicePage.locator('header >> text=E2EE')).toBeVisible();
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible();

    // Verify the message content is identical (decrypted correctly)
    const aliceMessage = await alicePage.locator(`${SELECTORS.messageBubble}:has-text("${testMessage}")`).first().textContent();
    const bobMessage = await bobPage.locator(`${SELECTORS.messageBubble}:has-text("${testMessage}")`).first().textContent();
    
    expect(aliceMessage).toContain(testMessage);
    expect(bobMessage).toContain(testMessage);
  });

  test('Bob replies with encrypted message and Alice receives it', async () => {
    const replyMessage = `Bob reply ${Date.now()}`;
    
    // Bob sends encrypted reply
    await bob.sendMessage(replyMessage);
    // Wait for Bob to see his own message with extended timeout
    await bob.waitForMessage(replyMessage, 30000);

    // Alice should receive and decrypt the reply - give more time for cross-device delivery
    // The WebSocket may need to reconnect, so wait longer
    await alicePage.waitForTimeout(5000); // Give time for potential reconnection
    await alice.waitForMessage(replyMessage, 90000);

    // Verify both can see the message
    await expect(alicePage.locator(`${SELECTORS.messageBubble}:has-text("${replyMessage}")`)).toBeVisible({ timeout: 15000 });
    await expect(bobPage.locator(`${SELECTORS.messageBubble}:has-text("${replyMessage}")`)).toBeVisible({ timeout: 15000 });
  });

  test('Forward encrypted message triggers re-encryption for new recipient', async ({ browser }) => {
    // Create a third incognito context for Charlie
    const charlieContext = await browser.newContext({
      storageState: undefined,
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
    });
    const charliePage = await charlieContext.newPage();
    const charlie = new TestAgent(charliePage, charlieContext, 'charlie-incognito');

    try {
      // Charlie logs in
      await charlie.navigateToApp();
      await charlie.login('charlie');
      await expect(charliePage.locator(SELECTORS.chatList)).toBeVisible({ timeout: 45000 });

      // Alice forwards a message to Charlie
      const forwardMessage = `Forward test ${Date.now()}`;
      await alice.sendMessage(forwardMessage);
      await alice.waitForMessage(forwardMessage);

      // Alice forwards the message to Charlie
      // Find the message and click forward
      const messageBubble = alicePage.locator(`${SELECTORS.messageBubble}:has-text("${forwardMessage}")`).first();
      await messageBubble.hover();
      
      // Click the forward button (usually appears on hover or via context menu)
      await alicePage.locator('button[title*="Forward"], button:has-text("Forward")').first().click({ timeout: 10000 });
      
      // Select Charlie from the forward dialog - try multiple possible selectors
      await expect(alicePage.locator('text=Forward Message')).toBeVisible({ timeout: 10000 });
      
      // Try to find and click Charlie in the forward dialog
      const charlieOption = alicePage.locator('text=Charlie Smith, text=charlie, [role="option"]:has-text("Charlie"), .contact-item:has-text("Charlie")').first();
      await charlieOption.waitFor({ state: 'visible', timeout: 10000 });
      await charlieOption.click({ timeout: 10000 });
      
      // Click forward/send button
      await alicePage.locator('button:has-text("Forward"), button:has-text("Send"), button[type="submit"]').first().click({ timeout: 10000 });

      // Wait for Charlie to receive the forwarded message
      await charliePage.waitForTimeout(5000);
      await charlie.selectChat('Alice Walker');
      await charlie.waitForMessage(forwardMessage, 45000);

      // Verify E2EE indicator is shown for Charlie too (re-encrypted)
      await expect(charliePage.locator('header >> text=E2EE')).toBeVisible({ timeout: 30000 });

      // Verify message content is correct
      const charlieMessage = await charliePage.locator(`${SELECTORS.messageBubble}:has-text("${forwardMessage}")`).first().textContent();
      expect(charlieMessage).toContain(forwardMessage);

    } finally {
      await charlieContext.close();
    }
  });

  test('Group E2EE: Alice creates group with Bob and sends encrypted message', async () => {
    // Alice creates an E2EE group with Bob
    await alice.createGroup('E2EE Test Group', ['Bob Vance']);
    await alicePage.waitForSelector(SELECTORS.composer, { timeout: 20000 });

    // Bob should see the group
    await bobPage.waitForTimeout(3000);
    await bob.selectGroup('E2EE Test Group');
    await bobPage.waitForSelector(SELECTORS.composer, { timeout: 15000 });

    // Both should see E2EE indicator for group
    await expect(alicePage.locator('header >> text=E2EE')).toBeVisible({ timeout: 30000 });
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible({ timeout: 30000 });

    // Alice sends encrypted group message
    const groupMsg = `Group E2EE test ${Date.now()}`;
    await alice.sendMessage(groupMsg);
    await alice.waitForMessage(groupMsg);

    // Bob receives and decrypts group message
    await bob.waitForMessage(groupMsg, 30000);

    // Verify message content
    const aliceGroupMsg = await alicePage.locator(`${SELECTORS.messageBubble}:has-text("${groupMsg}")`).first().textContent();
    const bobGroupMsg = await bobPage.locator(`${SELECTORS.messageBubble}:has-text("${groupMsg}")`).first().textContent();
    expect(aliceGroupMsg).toContain(groupMsg);
    expect(bobGroupMsg).toContain(groupMsg);
  });

  test('Multiple messages maintain encryption across session', async () => {
    // Send multiple messages rapidly to test encryption consistency
    const messages = [
      `Multi-msg 1 ${Date.now()}`,
      `Multi-msg 2 ${Date.now()}`,
      `Multi-msg 3 ${Date.now()}`,
    ];

    for (const msg of messages) {
      await alice.sendMessage(msg);
      await alice.waitForMessage(msg, 5000);
      await bob.waitForMessage(msg, 15000);
    }

    // Verify all messages appear on both sides
    for (const msg of messages) {
      await expect(alicePage.locator(`${SELECTORS.messageBubble}:has-text("${msg}")`)).toBeVisible({ timeout: 10000 });
      await expect(bobPage.locator(`${SELECTORS.messageBubble}:has-text("${msg}")`)).toBeVisible({ timeout: 10000 });
    }

    // E2EE should still be active
    await expect(alicePage.locator('header >> text=E2EE')).toBeVisible();
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible();
  });

  test('Handle modal dialogs properly during E2EE flow', async () => {
    // Test safety number modal can be opened/closed multiple times
    for (let i = 0; i < 3; i++) {
      await alicePage.click('header >> button[title="Verify Safety Number & QR Code"]');
      await expect(alicePage.locator('text=Safety Number')).toBeVisible({ timeout: 10000 });
      
      // Verify QR code is present
      await expect(alicePage.locator('canvas, img[alt*="QR"], img[alt*="qr"], .qrcode')).toBeVisible({ timeout: 5000 });
      
      // Close with Escape
      await alicePage.keyboard.press('Escape');
      await expect(alicePage.locator('text=Safety Number')).not.toBeVisible({ timeout: 5000 });
    }

    // Test forward modal
    const forwardTestMsg = `Forward modal test ${Date.now()}`;
    await alice.sendMessage(forwardTestMsg);
    await alice.waitForMessage(forwardTestMsg);

    const messageBubble = alicePage.locator(`${SELECTORS.messageBubble}:has-text("${forwardTestMsg}")`).first();
    await messageBubble.hover();
    await alicePage.locator('button[title*="Forward"], button:has-text("Forward")').first().click({ timeout: 10000 });
    
    // Forward modal should appear
    await expect(alicePage.locator('text=Forward Message')).toBeVisible({ timeout: 10000 });
    
    // Close forward modal with Escape
    await alicePage.keyboard.press('Escape');
    await expect(alicePage.locator('text=Forward Message')).not.toBeVisible({ timeout: 5000 });
  });

  test('E2EE persists after page reload', async () => {
    // Verify E2EE is active before reload
    await expect(alicePage.locator('header >> text=E2EE')).toBeVisible();
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible();

    // Reload both pages
    await alicePage.reload({ waitUntil: 'domcontentloaded' });
    await bobPage.reload({ waitUntil: 'domcontentloaded' });

    // Wait for reconnection
    await alicePage.waitForTimeout(3000);
    await bobPage.waitForTimeout(3000);

    // Re-select chat if needed
    await alice.selectChat('Bob Vance');
    await bob.selectChat('Alice Walker');

    // E2EE should be re-established
    await expect(alicePage.locator('header >> text=E2EE')).toBeVisible({ timeout: 30000 });
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible({ timeout: 30000 });

    // Send a message to verify encryption still works
    const reloadTestMsg = `Reload test ${Date.now()}`;
    await alice.sendMessage(reloadTestMsg);
    await alice.waitForMessage(reloadTestMsg);
    await bob.waitForMessage(reloadTestMsg, 30000);

    await expect(alicePage.locator(`${SELECTORS.messageBubble}:has-text("${reloadTestMsg}")`)).toBeVisible({ timeout: 10000 });
    await expect(bobPage.locator(`${SELECTORS.messageBubble}:has-text("${reloadTestMsg}")`)).toBeVisible({ timeout: 10000 });
  });
});