import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { TestAgent, DEMO_USERS, createTestAgents, SELECTORS } from './base';

const AGENT_COUNT = 4;
const TEST_TIMEOUT = 120000;

test.describe.configure({ retries: 1, timeout: TEST_TIMEOUT });

test.describe.parallel('Parallel Agent Tests - Core Features', () => {
  let browser: Browser;
  let agents: TestAgent[] = [];

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    agents = await createTestAgents(browser, AGENT_COUNT, [
      'alice-parallel',
      'bob-parallel',
      'charlie-parallel',
      'diana-parallel'
    ]);
    
    for (const agent of agents) {
      await agent.navigateToApp();
    }
    
    const credentials = ['alice', 'bob', 'charlie', 'diana'];
    await Promise.all(
      agents.map((agent, i) => agent.login(credentials[i]))
    );
    
    await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  });

  test.afterAll(async () => {
    for (const agent of agents) {
      await agent['context'].close();
    }
  });

  test('all agents connected simultaneously', async () => {
    for (const agent of agents) {
      await expect(agent['page'].locator(SELECTORS.composer)).toBeVisible();
    }
  });

  test('concurrent direct messages between pairs', async () => {
    const [alice, bob, charlie, diana] = agents;
    
    await alice.selectChat('Bob Vance');
    await charlie.selectChat('Diana Prince');
    
    const timestamp = Date.now();
    await Promise.all([
      alice.sendMessage(`Alice->Bob concurrent ${timestamp}`),
      charlie.sendMessage(`Charlie->Diana concurrent ${timestamp}`),
    ]);
    
    await Promise.all([
      bob.waitForMessage(`Alice->Bob concurrent ${timestamp}`),
      diana.waitForMessage(`Charlie->Diana concurrent ${timestamp}`),
    ]);
    
    await expect(bob['page'].locator(`text=Alice->Bob concurrent ${timestamp}`)).toBeVisible();
    await expect(diana['page'].locator(`text=Charlie->Diana concurrent ${timestamp}`)).toBeVisible();
  });

  test('cross-messaging all agents', async () => {
    const timestamp = Date.now();
    
    await agents[0].selectChat('Bob Vance');
    await agents[1].selectChat('Charlie Brown');
    await agents[2].selectChat('Diana Prince');
    await agents[3].selectChat('Alice Walker');
    
    await Promise.all(
      agents.map((agent, i) => {
        const targets = ['Bob Vance', 'Charlie Brown', 'Diana Prince', 'Alice Walker'];
        const msg = `${DEMO_USERS[i].displayName}->${targets[i]} ${timestamp}`;
        return agent.sendMessage(msg);
      })
    );
    
    await Promise.all(
      agents.map((agent, i) => {
        const targets = ['Bob Vance', 'Charlie Brown', 'Diana Prince', 'Alice Walker'];
        const msg = `${DEMO_USERS[i].displayName}->${targets[i]} ${timestamp}`;
        return agent.waitForMessage(msg);
      })
    );
  });

  test('rapid fire messages from all agents', async () => {
    const [alice, bob] = agents;
    
    await alice.selectChat('Bob Vance');
    await bob.selectChat('Alice Walker');
    
    const messages = Array.from({ length: 10 }, (_, i) => `Rapid ${i} - ${Date.now()}`);
    
    for (const msg of messages) {
      await Promise.all([
        alice.sendMessage(msg),
        bob.waitForMessage(msg),
      ]);
    }
    
    const aliceCount = await alice['page'].locator(SELECTORS.messageBubble).count();
    const bobCount = await bob['page'].locator(SELECTORS.messageBubble).count();
    
    expect(aliceCount).toBeGreaterThanOrEqual(10);
    expect(bobCount).toBeGreaterThanOrEqual(10);
  });

  test('simultaneous group creation', async () => {
    const [alice, charlie] = agents;
    
    const group1 = `Parallel Group 1 ${Date.now()}`;
    const group2 = `Parallel Group 2 ${Date.now()}`;
    
    await Promise.all([
      alice.createGroup(group1, ['Bob Vance']),
      charlie.createGroup(group2, ['Diana Prince']),
    ]);
    
    await agents[1].waitForSelector(`text=${group1}`, { timeout: 25000 });
    await agents[3].waitForSelector(`text=${group2}`, { timeout: 25000 });
    
    await expect(agents[1]['page'].locator(`text=${group1}`)).toBeVisible();
    await expect(agents[3]['page'].locator(`text=${group2}`)).toBeVisible();
  });

  test('concurrent typing indicators', async () => {
    const [alice, bob, charlie] = agents;
    
    await alice.selectChat('Bob Vance');
    await bob.selectChat('Alice Walker');
    await charlie.selectChat('Alice Walker');
    
    await Promise.all([
      alice['page'].locator(SELECTORS.composer).fill('Alice typing...'),
      bob['page'].locator(SELECTORS.composer).fill('Bob typing...'),
    ]);
    
    await Promise.all([
      expect(charlie['page'].locator(SELECTORS.typingIndicator)).toBeVisible({ timeout: 5000 }),
      expect(bob['page'].locator(SELECTORS.typingIndicator)).toBeVisible({ timeout: 5000 }),
    ]);
    
    await Promise.all([
      alice['page'].locator(SELECTORS.composer).fill(''),
      bob['page'].locator(SELECTORS.composer).fill(''),
    ]);
  });
});

test.describe.parallel('Parallel Agent Tests - Stress', () => {
  let browser: Browser;
  let agents: TestAgent[] = [];

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    agents = await createTestAgents(browser, AGENT_COUNT, [
      'alice-stress',
      'bob-stress',
      'charlie-stress',
      'diana-stress'
    ]);
    
    for (const agent of agents) {
      await agent.navigateToApp();
    }
    
    const credentials = ['alice', 'bob', 'charlie', 'diana'];
    await Promise.all(
      agents.map((agent, i) => agent.login(credentials[i]))
    );
    
    await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  });

  test.afterAll(async () => {
    for (const agent of agents) {
      await agent['context'].close();
    }
  });

  test('message storm - all agents send to all', async () => {
    const timestamp = Date.now();
    
    for (const agent of agents) {
      await agent.selectChat('Bob Vance');
    }
    
    const promises: Promise<void>[] = [];
    for (let i = 0; i < 5; i++) {
      for (const agent of agents) {
        const msg = `Storm ${i} from ${agent.getName()} ${timestamp}`;
        promises.push(agent.sendMessage(msg));
      }
    }
    
    await Promise.all(promises);
    
    await agents[1].waitForMessage(`Storm 4 from ${agents[0].getName()} ${timestamp}`);
  });

  test('connection resilience - rapid reconnect simulation', async () => {
    const [alice, bob] = agents;
    
    await alice.selectChat('Bob Vance');
    
    for (let i = 0; i < 3; i++) {
      const msg = `Reconnect test ${i} ${Date.now()}`;
      await alice.sendMessage(msg);
      await bob.waitForMessage(msg);
      await alice['page'].waitForTimeout(500);
    }
    
    await expect(bob['page'].locator(SELECTORS.composer)).toBeVisible();
  });

  test('long-running conversation persistence', async () => {
    const [alice, bob] = agents;
    
    await alice.selectChat('Bob Vance');
    await bob.selectChat('Alice Walker');
    
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 3; i++) {
        const msg = `Round ${round} msg ${i} ${Date.now()}`;
        await alice.sendMessage(msg);
        await bob.waitForMessage(msg);
      }
      
      for (let i = 0; i < 3; i++) {
        const msg = `Round ${round} reply ${i} ${Date.now()}`;
        await bob.sendMessage(msg);
        await alice.waitForMessage(msg);
      }
      
      await alice['page'].waitForTimeout(1000);
    }
    
    const totalMessages = await alice['page'].locator(SELECTORS.messageBubble).count();
    expect(totalMessages).toBeGreaterThanOrEqual(30);
  });
});

test.describe.parallel('Parallel Agent Tests - Edge Cases', () => {
  let browser: Browser;
  let agents: TestAgent[] = [];

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    agents = await createTestAgents(browser, AGENT_COUNT, [
      'alice-edge',
      'bob-edge',
      'charlie-edge',
      'diana-edge'
    ]);
    
    for (const agent of agents) {
      await agent.navigateToApp();
    }
    
    const credentials = ['alice', 'bob', 'charlie', 'diana'];
    await Promise.all(
      agents.map((agent, i) => agent.login(credentials[i]))
    );
    
    await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  });

  test.afterAll(async () => {
    for (const agent of agents) {
      await agent['context'].close();
    }
  });

  test('empty message handling', async () => {
    const [alice] = agents;
    await alice.selectChat('Bob Vance');
    
    const composer = alice['page'].locator(SELECTORS.composer);
    await composer.fill(' ');
    await composer.fill('');
    
    const sendButton = alice['page'].locator(SELECTORS.sendButton);
    await expect(sendButton).not.toBeVisible();
  });

  test('special characters in messages', async () => {
    const [alice, bob] = agents;
    
    await alice.selectChat('Bob Vance');
    await bob.selectChat('Alice Walker');
    
    const specialMessages = [
      '🎉 Emojis work! 🚀',
      '<script>alert("xss")</script>',
      'Unicode: café, naïve, résumé, 中文, 日本語, 한국어',
      'Newlines\nand\ttabs',
      'Very long message '.repeat(100),
    ];
    
    for (const msg of specialMessages) {
      await alice.sendMessage(msg);
      await bob.waitForMessage(msg);
    }
  });

  test('message edit/delete if supported', async () => {
    const [alice, bob] = agents;
    
    await alice.selectChat('Bob Vance');
    await bob.selectChat('Alice Walker');
    
    const msg = `Editable message ${Date.now()}`;
    await alice.sendMessage(msg);
    await bob.waitForMessage(msg);
    
    const messageElement = alice['page'].locator(`text=${msg}`).locator('..');
    
    if (await messageElement.locator('[data-testid="edit-message"]').isVisible({ timeout: 2000 })) {
      await messageElement.locator('[data-testid="edit-message"]').click();
      await messageElement.locator('[data-testid="edit-input"]').fill('Edited message');
      await messageElement.locator('[data-testid="save-edit"]').click();
      
      await expect(bob['page'].locator('text=Edited message')).toBeVisible({ timeout: 5000 });
    }
  });

  test('network interruption simulation', async () => {
    const [alice] = agents;
    
    await alice.selectChat('Bob Vance');
    
    await alice['context'].setOffline(true);
    await alice['page'].waitForTimeout(1000);
    
    const msg = `Offline message ${Date.now()}`;
    await alice.sendMessage(msg).catch(() => {});
    
    await alice['context'].setOffline(false);
    await alice['page'].waitForTimeout(3000);
    
    await expect(alice['page'].locator(SELECTORS.composer)).toBeVisible({ timeout: 10000 });
  });
});