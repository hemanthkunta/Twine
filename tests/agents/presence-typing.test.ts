import { test, expect } from '@playwright/test';
import { TestAgent, DEMO_USERS, SELECTORS, createTestAgents } from './base';

test.describe('Presence and Typing Indicators Tests', () => {
  test('alice sees bob online', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const onlineBadge = alice['page'].locator(SELECTORS.onlineBadge);
      await expect(onlineBadge).toBeVisible({ timeout: 10000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('bob sees typing indicator when alice types', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      await bob.selectChat('Alice Walker');
      
      const composer = alice['page'].locator(SELECTORS.composer);
      await composer.fill('Typing...');
      
      const typingIndicator = bob['page'].locator(SELECTORS.typingIndicator);
      await expect(typingIndicator).toBeVisible({ timeout: 5000 });
      
      await composer.fill('');
      
      await expect(typingIndicator).not.toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('typing indicator disappears after sending message', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      await bob.selectChat('Alice Walker');
      
      const composer = alice['page'].locator(SELECTORS.composer);
      await composer.fill('Test message');
      
      const typingIndicator = bob['page'].locator(SELECTORS.typingIndicator);
      await expect(typingIndicator).toBeVisible({ timeout: 5000 });
      
      await alice.sendMessage('Test message sent');
      
      await expect(typingIndicator).not.toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('presence updates when user goes offline', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      
      const onlineBadge = alice['page'].locator(SELECTORS.onlineBadge);
      await expect(onlineBadge).toBeVisible({ timeout: 10000 });
      
      await bob['context'].close();
      
      await alice['page'].waitForTimeout(3000);
      
      await expect(alice['page'].locator('[data-testid="offline-badge"], text=offline')).toBeVisible({ timeout: 10000 });
    } finally {
      if (!alice['context']._closed) {
        await alice['context'].close();
      }
    }
  });

  test('multiple users typing in group', async ({ browser }) => {
    const agents = await createTestAgents(browser, 3, ['alice', 'bob', 'charlie']);
    const [alice, bob, charlie] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await charlie.navigateToApp();
      
      await alice.login('alice');
      await bob.login('bob');
      await charlie.login('charlie');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      const groupName = `Typing Group ${Date.now()}`;
      await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
      
      await bob.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      await bob.click(`text=${groupName}`);
      await bob['page'].waitForSelector(SELECTORS.composer, { timeout: 15000 });
      
      await charlie.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      await charlie.click(`text=${groupName}`);
      await charlie['page'].waitForSelector(SELECTORS.composer, { timeout: 15000 });
      
      await bob['page'].locator(SELECTORS.composer).fill('Bob typing');
      
      const aliceTyping = alice['page'].locator(SELECTORS.typingIndicator);
      await expect(aliceTyping).toBeVisible({ timeout: 5000 });
      
      await bob['page'].locator(SELECTORS.composer).fill('');
      
      await charlie['page'].locator(SELECTORS.composer).fill('Charlie typing');
      
      await expect(aliceTyping).toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('presence badge in chat list', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice['page'].waitForTimeout(2000);
      
      const chatList = alice['page'].locator(SELECTORS.chatList);
      await expect(chatList.locator(`text=Bob Vance`)).toBeVisible();
      
      await bob['context'].close();
      
      await alice['page'].waitForTimeout(3000);
      
      const bobChat = alice['page'].locator(`text=Bob Vance`).locator('..');
      await expect(bobChat.locator('[data-testid="offline-badge"], text=offline')).toBeVisible({ timeout: 10000 });
    } finally {
      if (!alice['context']._closed) {
        await alice['context'].close();
      }
    }
  });
});