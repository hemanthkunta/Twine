import { test, expect } from '@playwright/test';
import { TestAgent, DEMO_USERS, SELECTORS, createTestAgents } from './base';

test.describe('Multi-Device Sync Tests', () => {
  test('alice logs in on two devices - message sync', async ({ browser }) => {
    const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
    const [alice1, alice2, bob] = agents;
    
    try {
      await alice1.navigateToApp();
      await alice2.navigateToApp();
      await bob.navigateToApp();
      
      await alice1.login('alice');
      await alice2.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice1.selectChat('Bob Vance');
      await alice2.selectChat('Bob Vance');
      await bob.selectChat('Alice Walker');
      
      const message = `Sync test ${Date.now()}`;
      await alice1.sendMessage(message);
      
      await alice1.waitForMessage(message);
      await alice2.waitForMessage(message);
      await bob.waitForMessage(message);
      
      await expect(alice2['page'].locator(`text=${message}`)).toBeVisible();
      await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('bob receives message on both devices', async ({ browser }) => {
    const agents = await createTestAgents(browser, 3, ['alice', 'bob-device1', 'bob-device2']);
    const [alice, bob1, bob2] = agents;
    
    try {
      await alice.navigateToApp();
      await bob1.navigateToApp();
      await bob2.navigateToApp();
      
      await alice.login('alice');
      await bob1.login('bob');
      await bob2.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      await bob1.selectChat('Alice Walker');
      await bob2.selectChat('Alice Walker');
      
      const message = `Bob sync ${Date.now()}`;
      await alice.sendMessage(message);
      
      await alice.waitForMessage(message);
      await bob1.waitForMessage(message);
      await bob2.waitForMessage(message);
      
      await expect(bob1['page'].locator(`text=${message}`)).toBeVisible();
      await expect(bob2['page'].locator(`text=${message}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('read receipt sync across devices', async ({ browser }) => {
    const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
    const [alice1, alice2, bob] = agents;
    
    try {
      await alice1.navigateToApp();
      await alice2.navigateToApp();
      await bob.navigateToApp();
      
      await alice1.login('alice');
      await alice2.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await bob.selectChat('Alice Walker');
      await alice1.selectChat('Bob Vance');
      
      const message = `Read receipt sync ${Date.now()}`;
      await bob.sendMessage(message);
      
      await alice1.waitForMessage(message);
      await alice2.waitForMessage(message);
      
      await alice1['page'].click(`text=${message}`);
      await alice1['page'].waitForTimeout(1000);
      
      await expect(alice2['page'].locator(SELECTORS.statusTicks + ':has-text("read")')).toBeVisible({ timeout: 10000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('chat list sync across devices', async ({ browser }) => {
    const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
    const [alice1, alice2, bob] = agents;
    
    try {
      await alice1.navigateToApp();
      await alice2.navigateToApp();
      await bob.navigateToApp();
      
      await alice1.login('alice');
      await alice2.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      const groupName = `Sync Group ${Date.now()}`;
      await alice1.createGroup(groupName, ['Bob Vance']);
      
      await alice2.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      await expect(alice2['page'].locator(`text=${groupName}`)).toBeVisible();
      
      await bob.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      await expect(bob['page'].locator(`text=${groupName}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('typing indicator sync across devices', async ({ browser }) => {
    const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
    const [alice1, alice2, bob] = agents;
    
    try {
      await alice1.navigateToApp();
      await alice2.navigateToApp();
      await bob.navigateToApp();
      
      await alice1.login('alice');
      await alice2.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await bob.selectChat('Alice Walker');
      await alice1.selectChat('Bob Vance');
      await alice2.selectChat('Bob Vance');
      
      await alice1['page'].locator(SELECTORS.composer).fill('Typing on device 1');
      
      const typingIndicator = bob['page'].locator(SELECTORS.typingIndicator);
      await expect(typingIndicator).toBeVisible({ timeout: 5000 });
      
      await alice1['page'].locator(SELECTORS.composer).fill('');
      
      await expect(typingIndicator).not.toBeVisible({ timeout: 5000 });
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('message order consistency across devices', async ({ browser }) => {
    const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
    const [alice1, alice2, bob] = agents;
    
    try {
      await alice1.navigateToApp();
      await alice2.navigateToApp();
      await bob.navigateToApp();
      
      await alice1.login('alice');
      await alice2.login('alice');
      await bob.login('bob');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice1.selectChat('Bob Vance');
      await alice2.selectChat('Bob Vance');
      await bob.selectChat('Alice Walker');
      
      const messages = [
        `Msg 1 ${Date.now()}`,
        `Msg 2 ${Date.now()}`,
        `Msg 3 ${Date.now()}`,
        `Msg 4 ${Date.now()}`,
        `Msg 5 ${Date.now()}`,
      ];
      
      for (const msg of messages) {
        await alice1.sendMessage(msg);
      }
      
      await bob.waitForMessage(messages[messages.length - 1]);
      await alice2.waitForMessage(messages[messages.length - 1]);
      
      const bobMessages = await bob['page'].locator(SELECTORS.messageBubble).allInnerTexts();
      const alice2Messages = await alice2['page'].locator(SELECTORS.messageBubble).allInnerTexts();
      
      const bobOrdered = bobMessages.filter(m => messages.some(msg => m.includes(msg)));
      const alice2Ordered = alice2Messages.filter(m => messages.some(msg => m.includes(msg)));
      
      expect(bobOrdered).toEqual(alice2Ordered);
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });
});