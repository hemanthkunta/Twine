import { Page, BrowserContext } from '@playwright/test';
import fs from 'node:fs';

export const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3000';
export const API_URL = process.env.PW_API_URL || 'http://localhost:4000';

export const SELECTORS = {
  authModal: 'div.fixed.inset-0.z-50:has(input[placeholder="Username (e.g. alice or bob)"])',
  usernameInput: 'input[placeholder="Username (e.g. alice or bob)"]',
  passwordInput: 'input[placeholder="Password"]',
  signInButton: 'button[type="submit"]:has-text("Sign In")',
  composer: 'input[placeholder="Write a message... (type @ai to query bot)"]',
  sendButton: 'button[title="Send Message (Enter)"]',
  newGroupButton: 'button[title="New Group / Channel"]',
  newChatButton: 'button[title="New Direct Message"]',
  chatList: 'aside',
  messageBubble: '.msg-bubble',
  typingIndicator: 'header >> text=typing',
  onlineBadge: 'header >> text=online',
  lastSeenBadge: 'header >> text=/last seen/',
  callButton: 'button[title="Voice Call (WebRTC)"]',
  videoCallButton: 'button[title="Video Call (WebRTC)"]',
  callModal: 'div.fixed.inset-0:has-text("Call")',
  incomingCall: 'div.fixed.inset-0:has-text("Incoming")',
  acceptCallButton: 'button[title="Accept Call"]',
  declineCallButton: 'button[title="Decline Call"]',
  endCallButton: 'button[title="End Call"]',
  muteButton: 'button[title*="microphone"]',
  videoToggleButton: 'button[title*="camera"]',
  startChatButton: 'button:has-text("Start 1:1 Chat")',
  welcomeHeading: 'text=Welcome to Twine',
  searchUsersInput: 'input[placeholder="Search by name, @username or phone..."]',
  searchChatsInput: 'input[placeholder="Search chats, groups, channels..."]',
};

export const DEMO_USERS = [
  { username: 'alice', password: 'password123', displayName: 'Alice Walker' },
  { username: 'bob', password: 'password123', displayName: 'Bob Vance' },
  { username: 'charlie', password: 'password123', displayName: 'Charlie Brown' },
  { username: 'diana', password: 'password123', displayName: 'Diana Prince' },
];

export class TestAgent {
  protected page: Page;
  protected context: BrowserContext;
  protected name: string;

  constructor(page: Page, context: BrowserContext, name: string) {
    this.page = page;
    this.context = context;
    this.name = name;
  }

  async navigateToApp() {
    await this.page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  }

  async login(username: string, password: string = 'password123') {
    const modal = this.page.locator(SELECTORS.authModal);
    await modal.waitFor({ state: 'visible', timeout: 30000 });

    await modal.locator(SELECTORS.usernameInput).fill(username);
    await modal.locator(SELECTORS.passwordInput).fill(password);
    await modal.locator(SELECTORS.signInButton).click();

    try {
      await this.page.waitForFunction(
        () => {
          const chatList = document.querySelector('aside');
          const welcome = Array.from(document.querySelectorAll('h3')).some((el) =>
            el.textContent?.includes('Welcome to Twine')
          );
          const composer = document.querySelector(
            'input[placeholder="Write a message... (type @ai to query bot)"]'
          );
          return Boolean(chatList || welcome || composer);
        },
        { timeout: 45000 }
      );
    } catch (error) {
      const bodyText = (await this.page.locator('body').innerText().catch(() => ''))
        .replace(/\s+/g, ' ')
        .slice(0, 500);
      const authError = await this.page
        .locator('div:has-text("failed"), div:has-text("Invalid")')
        .first()
        .textContent()
        .catch(() => null);
      throw new Error(
        `Login for "${username}" did not reach the app shell. Auth error: ${authError || 'none'}. Body: ${bodyText}`
      );
    }

    await this.waitForWebSocketConnection();
  }

  async waitForWebSocketConnection(_timeout = 10000) {
    await this.page.waitForTimeout(2000);
  }

  async ensureChatReady() {
    if (await this.page.locator(SELECTORS.composer).isVisible().catch(() => false)) return;
    const startButton = this.page.locator(SELECTORS.startChatButton);
    if (await startButton.isVisible().catch(() => false)) {
      await startButton.click();
      await this.page.locator(SELECTORS.searchUsersInput).waitFor({ state: 'visible', timeout: 15000 });
      await this.page.locator(SELECTORS.searchUsersInput).fill('');
      await this.page.getByText(DEMO_USERS[1].displayName, { exact: true }).first().click();
    }
    await this.page.waitForSelector(SELECTORS.composer, { timeout: 15000 });
  }

  async sendMessage(text: string) {
    const composer = this.page.locator(SELECTORS.composer);
    await composer.waitFor({ state: 'visible', timeout: 15000 });
    await composer.fill(text);
    await this.page.keyboard.press('Enter');
    await this.page.waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        return !!el && (el as HTMLInputElement).value === '';
      },
      SELECTORS.composer,
      { timeout: 10000 }
    );
  }

  async selectChat(contactName: string) {
    const chatList = this.page.locator(SELECTORS.chatList);
    const existingChat = chatList.locator('div.cursor-pointer').getByText(contactName, { exact: true }).first();

    if (await existingChat.isVisible().catch(() => false)) {
      await existingChat.click({ timeout: 15000 });
      await this.page.waitForSelector(SELECTORS.composer, { timeout: 15000 });
      return;
    }

    await this.startDirectChat(contactName);
  }

  async startDirectChat(displayName: string) {
    await this.page.click(SELECTORS.newChatButton, { timeout: 15000 });
    await this.page.locator(SELECTORS.searchUsersInput).waitFor({ state: 'visible', timeout: 15000 });
    await this.page.locator(SELECTORS.searchUsersInput).fill(displayName);
    await this.page.getByText(displayName, { exact: true }).first().click({ timeout: 15000 });
    await this.page.waitForSelector(SELECTORS.composer, { timeout: 15000 });
  }

  async waitForMessage(text: string, timeout = 20000) {
    await this.page.locator(`${SELECTORS.messageBubble}:has-text("${text}")`).first().waitFor({
      state: 'visible',
      timeout,
    });
  }

  async createGroup(groupName: string, members: string[]) {
    await this.page.click(SELECTORS.newGroupButton, { timeout: 15000 });
    const modal = this.page.locator('div.fixed.inset-0:has-text("Create")');
    await modal.waitFor({ state: 'visible', timeout: 15000 });
    await modal.locator('input[type="text"]').first().fill(groupName);

    for (const member of members) {
      await modal.getByText(member, { exact: true }).first().click({ timeout: 10000 });
    }

    await modal.locator('button[type="submit"]').click();
    await this.page.waitForSelector(SELECTORS.composer, { timeout: 20000 });
  }

  async takeScreenshot(name: string) {
    fs.mkdirSync('test-results/screenshots', { recursive: true });
    await this.page.screenshot({ path: `test-results/screenshots/${this.name}-${name}.png`, fullPage: true });
  }

  getName() {
    return this.name;
  }
}

export class MultiAgentTestRunner {
  private agents: TestAgent[] = [];

  addAgent(agent: TestAgent) {
    this.agents.push(agent);
  }

  getAgents() {
    return this.agents;
  }

  async runAll(fn: (agent: TestAgent) => Promise<void>) {
    await Promise.all(this.agents.map((agent) => fn(agent)));
  }

  async runSequential(fn: (agent: TestAgent, index: number) => Promise<void>) {
    for (let i = 0; i < this.agents.length; i++) {
      await fn(this.agents[i], i);
    }
  }
}

export async function createTestAgents(
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