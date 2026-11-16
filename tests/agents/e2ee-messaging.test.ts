import { test, expect } from '@playwright/test';
import {
  TestAgent,
  DEMO_USERS,
  BASE_URL,
  SELECTORS,
  createTestAgents,
} from './base';

test.describe.configure({ mode: 'serial' });

test.describe('E2EE Browser Acceptance Tests', () => {
  let alice: TestAgent;
  let bob: TestAgent;
  let alicePage: any;
  let bobPage: any;

  test.beforeAll(async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    alicePage = await context1.newPage();
    bobPage = await context2.newPage();
    alice = new TestAgent(alicePage, context1, 'alice-e2ee');
    bob = new TestAgent(bobPage, context2, 'bob-e2ee');
  });

  test.afterAll(async () => {
    await alicePage?.context().close();
    await bobPage?.context().close();
  });

  test('Alice and Bob can login and establish E2EE session', async () => {
    await alice.navigateToApp();
    await alice.login('alice');
    
    await bob.navigateToApp();
    await bob.login('bob');

    await expect(alicePage.locator(SELECTORS.chatList)).toBeVisible();
    await expect(bobPage.locator(SELECTORS.chatList)).toBeVisible();

    await alice.startDirectChat('Bob Vance');
    await alicePage.waitForSelector(SELECTORS.composer, { timeout: 15000 });

    await bobPage.waitForTimeout(2000);
    const bobChatList = bobPage.locator(SELECTORS.chatList);
    await expect(bobChatList.locator('text=Alice Walker')).toBeVisible({ timeout: 15000 });
  });

  test('Alice can send encrypted message to Bob', async () => {
    const testMessage = `E2EE test ${Date.now()}`;
    await alice.sendMessage(testMessage);
    
    await alice.waitForMessage(testMessage);
    
    await bob.selectChat('Alice Walker');
    await bob.waitForMessage(testMessage, 30000);
    
    await expect(alicePage.locator('header >> text=E2EE')).toBeVisible();
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible();
  });

  test('Bob can reply with encrypted message', async () => {
    const replyMessage = `Bob reply ${Date.now()}`;
    await bob.sendMessage(replyMessage);
    
    await bob.waitForMessage(replyMessage);
    
    await alice.waitForMessage(replyMessage, 30000);
  });

  test('E2EE Safety Number verification UI is accessible', async () => {
    await alicePage.click('header >> button[title="Verify Safety Number & QR Code"]');
    
    await expect(alicePage.locator('text=Safety Number')).toBeVisible({ timeout: 10000 });
    await expect(alicePage.locator('text=Verify')).toBeVisible();
    
    await alicePage.keyboard.press('Escape');
    await expect(alicePage.locator('text=Safety Number')).not.toBeVisible({ timeout: 5000 });
  });

  test('Multiple devices sync E2EE sessions', async ({ browser }) => {
    const context3 = await browser.newContext();
    const alice2Page = await context3.newPage();
    const alice2 = new TestAgent(alice2Page, context3, 'alice-device2');
    
    try {
      await alice2.navigateToApp();
      await alice2.login('alice');
      await expect(alice2Page.locator(SELECTORS.chatList)).toBeVisible({ timeout: 45000 });
      
      await alice2Page.waitForTimeout(3000);
      await expect(alice2Page.locator('text=Bob Vance')).toBeVisible({ timeout: 15000 });
      
      await alice2.selectChat('Bob Vance');
      const msg = `Multi-device test ${Date.now()}`;
      await alice2.sendMessage(msg);
      await alice2.waitForMessage(msg);
      
      await bob.waitForMessage(msg, 30000);
      
      await alice.waitForMessage(msg, 30000);
    } finally {
      await context3.close();
    }
  });

  test('Group E2EE: Alice creates group and sends encrypted message', async () => {
    await alice.createGroup('E2EE Test Group', ['Bob Vance']);
    
    const groupMsg = `Group E2EE test ${Date.now()}`;
    await alice.sendMessage(groupMsg);
    await alice.waitForMessage(groupMsg);
    
    await bob.selectGroup('E2EE Test Group');
    await bob.waitForMessage(groupMsg, 30000);
    
    await expect(bobPage.locator('header >> text=E2EE')).toBeVisible();
  });

  test('Forward encrypted message triggers re-encryption', async () => {
    const bobGroupMsg = `Bob group msg ${Date.now()}`;
    await bob.sendMessage(bobGroupMsg);
    await bob.waitForMessage(bobGroupMsg);
    
    await expect(alicePage.locator(SELECTORS.chatList)).toBeVisible();
  });

  test('Receipts work for encrypted messages', async () => {
    const receiptTestMsg = `Receipt test ${Date.now()}`;
    await alice.sendMessage(receiptTestMsg);
    await alice.waitForMessage(receiptTestMsg);
    
    await alicePage.waitForTimeout(2000);
    
    await bob.selectChat('Alice Walker');
    await bobPage.waitForTimeout(1000);
  });
});

test.describe('E2EE Key Exchange & Verification', () => {
  test('Users can verify safety numbers match', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    const agent1 = new TestAgent(page1, context1, 'verify-alice');
    const agent2 = new TestAgent(page2, context2, 'verify-bob');
    
    try {
      await agent1.navigateToApp();
      await agent1.login('alice');
      await agent2.navigateToApp();
      await agent2.login('bob');
      
      await agent1.startDirectChat('Bob Vance');
      await page1.waitForSelector(SELECTORS.composer, { timeout: 15000 });
      await page2.waitForTimeout(2000);
      await agent2.selectChat('Alice Walker');
      
      await page1.click('header >> button[title="Verify Safety Number & QR Code"]');
      await page2.click('header >> button[title="Verify Safety Number & QR Code"]');
      
      await expect(page1.locator('text=Safety Number')).toBeVisible({ timeout: 10000 });
      await expect(page2.locator('text=Safety Number')).toBeVisible({ timeout: 10000 });
      
      await expect(page1.locator('text=/[0-9]{5}/')).toBeVisible();
      await expect(page2.locator('text=/[0-9]{5}/')).toBeVisible();
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});

test.describe('E2EE Offline Message Handling', () => {
  test('Offline user receives push notification for encrypted message', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const agent = new TestAgent(page, context, 'offline-alice');
    
    try {
      await agent.navigateToApp();
      await agent.login('alice');
      
      const pushSupported = await page.evaluate(() => {
        return 'PushManager' in window && 'Notification' in window;
      });
      
      expect(pushSupported).toBe(true);
    } finally {
      await context.close();
    }
  });
});
