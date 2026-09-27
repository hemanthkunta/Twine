import { test, expect } from '@playwright/test';
import { TestAgent, DEMO_USERS, SELECTORS, createTestAgents } from './base';

test.describe('Group Messaging Tests', () => {
  test('alice creates group with bob and charlie', async ({ browser }) => {
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
      
      const groupName = `Test Group ${Date.now()}`;
      await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
      
      await expect(alice['page'].locator(SELECTORS.composer)).toBeVisible();
      
      await bob.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      await expect(bob['page'].locator(`text=${groupName}`)).toBeVisible();
      
      await charlie.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      await expect(charlie['page'].locator(`text=${groupName}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('group message fan-out to all members', async ({ browser }) => {
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
      
      const groupName = `Fanout Group ${Date.now()}`;
      await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
      
      const message = `Group message ${Date.now()}`;
      await alice.sendMessage(message);
      
      await alice.waitForMessage(message);
      await bob.waitForMessage(message);
      await charlie.waitForMessage(message);
      
      await expect(alice['page'].locator(`text=${message}`)).toBeVisible();
      await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
      await expect(charlie['page'].locator(`text=${message}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('bob replies in group', async ({ browser }) => {
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
      
      const groupName = `Reply Group ${Date.now()}`;
      await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
      
      await alice.sendMessage(`Alice starts ${Date.now()}`);
      
      await bob.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      await bob.click(`text=${groupName}`);
      await bob['page'].waitForSelector(SELECTORS.composer, { timeout: 15000 });
      
      const reply = `Bob replies ${Date.now()}`;
      await bob.sendMessage(reply);
      
      await alice.waitForMessage(reply);
      await charlie.waitForMessage(reply);
      
      await expect(alice['page'].locator(`text=${reply}`)).toBeVisible();
      await expect(charlie['page'].locator(`text=${reply}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('multiple groups simultaneously', async ({ browser }) => {
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
      
      const group1 = `Group One ${Date.now()}`;
      const group2 = `Group Two ${Date.now()}`;
      
      await alice.createGroup(group1, ['Bob Vance']);
      await charlie.createGroup(group2, ['Diana Prince']);
      
      await Promise.all([
        alice.sendMessage(`Group 1 message ${Date.now()}`),
        charlie.sendMessage(`Group 2 message ${Date.now()}`),
      ]);
      
      await bob.waitForSelector(`text=${group1}`, { timeout: 25000 });
      await diana.waitForSelector(`text=${group2}`, { timeout: 25000 });
      
      await expect(bob['page'].locator(`text=${group1}`)).toBeVisible();
      await expect(diana['page'].locator(`text=${group2}`)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });

  test('group message delivery receipts', async ({ browser }) => {
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
      
      const groupName = `Receipt Group ${Date.now()}`;
      await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
      
      const message = `Receipt test ${Date.now()}`;
      await alice.sendMessage(message);
      
      await alice.waitForMessage(message);
      await bob.waitForMessage(message);
      await charlie.waitForMessage(message);
      
      await expect(alice['page'].locator(SELECTORS.statusTicks)).toBeVisible();
    } finally {
      for (const agent of agents) {
        await agent['context'].close();
      }
    }
  });
});