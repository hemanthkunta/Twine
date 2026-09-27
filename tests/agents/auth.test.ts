import { test, expect } from '@playwright/test';
import { TestAgent, DEMO_USERS, BASE_URL, SELECTORS } from './base';

test.describe.configure({ mode: 'serial' });

test.describe('Authentication Flow Tests', () => {
  test('single user login - alice', async ({ page, context }) => {
    const agent = new TestAgent(page, context, 'alice');
    await agent.navigateToApp();
    await agent.login('alice');
    
    await expect(page.locator(SELECTORS.chatList)).toBeVisible();
    await expect(page.locator(SELECTORS.authModal)).not.toBeVisible();
  });

  test('single user login - bob', async ({ page, context }) => {
    const agent = new TestAgent(page, context, 'bob');
    await agent.navigateToApp();
    await agent.login('bob');
    
    await expect(page.locator(SELECTORS.chatList)).toBeVisible();
  });

  test('all demo users can login', async ({ browser }) => {
    for (const user of DEMO_USERS) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const agent = new TestAgent(page, context, user.username);

      try {
        await agent.navigateToApp();
        await agent.login(user.username);
        await expect(page.locator(SELECTORS.chatList)).toBeVisible();
      } finally {
        await context.close();
      }
    }
  });

  test('failed login with wrong password', async ({ page, context }) => {
    const agent = new TestAgent(page, context, 'alice-fail');
    await agent.navigateToApp();
    
    const modal = page.locator(SELECTORS.authModal);
    await modal.waitFor({ state: 'visible' });
    await modal.locator(SELECTORS.usernameInput).fill('alice');
    await modal.locator(SELECTORS.passwordInput).fill('wrongpassword');
    await modal.locator(SELECTORS.signInButton).click();
    
    await expect(modal).toBeVisible();
    await expect(page.locator(SELECTORS.composer)).not.toBeVisible();
  });

  test('login persistence after reload', async ({ page, context }) => {
    const agent = new TestAgent(page, context, 'alice-persist');
    await agent.navigateToApp();
    await agent.login('alice');
    
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    await expect(page.locator(SELECTORS.chatList)).toBeVisible({ timeout: 30000 });
  });

  test('logout and login as different user', async ({ page, context }) => {
    const agent = new TestAgent(page, context, 'multi-user');
    await agent.navigateToApp();
    await agent.login('alice');
    await expect(page.locator(SELECTORS.chatList)).toBeVisible();
    
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded' });
    
    await agent.login('bob');
    await expect(page.locator(SELECTORS.chatList)).toBeVisible();
  });
});

async function createTestAgents(
  browser: any,
  count: number,
  names: string[]
): Promise<TestAgent[]> {
  const agents: TestAgent[] = [];
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    agents.push(new TestAgent(page, context, names[i] || `agent-${i}`));
  }
  return agents;
}