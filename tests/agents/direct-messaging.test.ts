import { test, expect } from '@playwright/test';
import { TestAgent, DEMO_USERS, SELECTORS, createTestAgents } from './base';

test.describe('Direct Messaging Tests', () => {
  test('alice sends message to bob', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await alice.waitForWebSocketConnection();
      await bob.waitForWebSocketConnection();
      
      await alice.selectChat('Bob Vance');
      
      const message = `Hello from Alice ${Date.now()}`;
      await alice.sendMessage(message);
      
      await alice.waitForMessage(message);
      await expect(alice['page'].locator(`text=${message}`)).toBeVisible();
      
      await bob.waitForMessage(message);
      await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('bob replies to alice', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await alice.waitForWebSocketConnection();
      await bob.waitForWebSocketConnection();
      
      await bob.selectChat('Alice Walker');
      
      const message = `Reply from Bob ${Date.now()}`;
      await bob.sendMessage(message);
      
      await bob.waitForMessage(message);
      await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
      
      await alice.waitForMessage(message);
      await expect(alice['page'].locator(`text=${message}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('bidirectional conversation', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await alice.waitForWebSocketConnection();
      await bob.waitForWebSocketConnection();
      
      await alice.selectChat('Bob Vance');
      
      for (let i = 0; i < 5; i++) {
        const fromAlice = `Alice message ${i} - ${Date.now()}`;
        await alice.sendMessage(fromAlice);
        await alice.waitForMessage(fromAlice);
        await bob.waitForMessage(fromAlice);
        
        const fromBob = `Bob reply ${i} - ${Date.now()}`;
        await bob.sendMessage(fromBob);
        await bob.waitForMessage(fromBob);
        await alice.waitForMessage(fromBob);
      }
      
      const aliceMessages = await alice['page'].locator(SELECTORS.messageBubble).count();
      const bobMessages = await bob['page'].locator(SELECTORS.messageBubble).count();
      
      expect(aliceMessages).toBeGreaterThanOrEqual(5);
      expect(bobMessages).toBeGreaterThanOrEqual(5);
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('message delivery receipts', async ({ browser }) => {
    const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
    const [alice, bob] = agents;
    
    try {
      await alice.navigateToApp();
      await bob.navigateToApp();
      await alice.login('alice');
      await bob.login('bob');
      
      await alice.waitForWebSocketConnection();
      await bob.waitForWebSocketConnection();
      
      await alice.selectChat('Bob Vance');
      
      const message = `Test receipts ${Date.now()}`;
      await alice.sendMessage(message);
      
      await alice.waitForMessage(message);
      await bob.waitForMessage(message);
      
      await expect(alice['page'].locator(SELECTORS.statusTicks)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('multiple concurrent conversations', async ({ browser }) => {
    const agents = await createTestAgents(browser, 4, ['alice', 'bob', 'charlie', 'diana']);
    const [alice, bob, charlie, diana] = agents;
    
    try {
      for (const agent of agents) {
        await agent.navigateToApp();
      }
      await alice.login('alice');
      await bob.login('bob');
      await charlie.login('charlie');
      await diana.login('diana');
      
      await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
      
      await alice.selectChat('Bob Vance');
      await charlie.selectChat('Diana Prince');
      
      const msg1 = `Alice->Bob ${Date.now()}`;
      const msg2 = `Charlie->Diana ${Date.now()}`;
      
      await Promise.all([
        alice.sendMessage(msg1),
        charlie.sendMessage(msg2),
      ]);
      
      await Promise.all([
        bob.waitForMessage(msg1),
        diana.waitForMessage(msg2),
      ]);
      
      await expect(bob['page'].locator(`text=${msg1}`)).toBeVisible();
      await expect(diana['page'].locator(`text=${msg2}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });
});