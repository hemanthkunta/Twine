# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\parallel-runner.test.ts >> Parallel Agent Tests - Stress >> long-running conversation persistence
- Location: tests\agents\parallel-runner.test.ts:222:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "domcontentloaded"

```

# Test source

```ts
  1   | import { Page, BrowserContext } from '@playwright/test';
  2   | import fs from 'node:fs';
  3   | 
  4   | export const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3000';
  5   | export const API_URL = process.env.PW_API_URL || 'http://localhost:4000';
  6   | 
  7   | export const SELECTORS = {
  8   |   authModal: 'div.fixed.inset-0.z-50:has(input[placeholder="Username (e.g. alice or bob)"])',
  9   |   usernameInput: 'input[placeholder="Username (e.g. alice or bob)"]',
  10  |   passwordInput: 'input[placeholder="Password"]',
  11  |   signInButton: 'button[type="submit"]:has-text("Sign In")',
  12  |   composer: 'input[placeholder="Write a message... (type @ai to query bot)"]',
  13  |   sendButton: 'button[title="Send Message (Enter)"]',
  14  |   newGroupButton: 'button[title="New Group / Channel"]',
  15  |   newChatButton: 'button[title="New Direct Message"]',
  16  |   chatList: 'aside',
  17  |   messageBubble: '.msg-bubble',
  18  |   typingIndicator: 'header >> text=typing',
  19  |   onlineBadge: 'header >> text=online',
  20  |   lastSeenBadge: 'header >> text=/last seen/',
  21  |   callButton: 'button[title="Voice Call (WebRTC)"]',
  22  |   videoCallButton: 'button[title="Video Call (WebRTC)"]',
  23  |   callModal: 'div.fixed.inset-0:has-text("Call")',
  24  |   incomingCall: 'div.fixed.inset-0:has-text("Incoming")',
  25  |   acceptCallButton: 'button[title="Accept Call"]',
  26  |   declineCallButton: 'button[title="Decline Call"]',
  27  |   endCallButton: 'button[title="End Call"]',
  28  |   muteButton: 'button[title*="microphone"]',
  29  |   videoToggleButton: 'button[title*="camera"]',
  30  |   startChatButton: 'button:has-text("Start 1:1 Chat")',
  31  |   welcomeHeading: 'text=Welcome to Twine',
  32  |   searchUsersInput: 'input[placeholder="Search by name, @username or phone..."]',
  33  |   searchChatsInput: 'input[placeholder="Search chats, groups, channels..."]',
  34  | };
  35  | 
  36  | export const DEMO_USERS = [
  37  |   { username: 'alice', password: 'password123', displayName: 'Alice Walker' },
  38  |   { username: 'bob', password: 'password123', displayName: 'Bob Vance' },
  39  |   { username: 'charlie', password: 'password123', displayName: 'Charlie Brown' },
  40  |   { username: 'diana', password: 'password123', displayName: 'Diana Prince' },
  41  | ];
  42  | 
  43  | export class TestAgent {
  44  |   protected page: Page;
  45  |   protected context: BrowserContext;
  46  |   protected name: string;
  47  | 
  48  |   constructor(page: Page, context: BrowserContext, name: string) {
  49  |     this.page = page;
  50  |     this.context = context;
  51  |     this.name = name;
  52  |   }
  53  | 
  54  |   async navigateToApp() {
> 55  |     await this.page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      |                     ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:3000/
  56  |   }
  57  | 
  58  |   async login(username: string, password: string = 'password123') {
  59  |     const modal = this.page.locator(SELECTORS.authModal);
  60  |     await modal.waitFor({ state: 'visible', timeout: 30000 });
  61  | 
  62  |     await modal.locator(SELECTORS.usernameInput).fill(username);
  63  |     await modal.locator(SELECTORS.passwordInput).fill(password);
  64  |     await modal.locator(SELECTORS.signInButton).click();
  65  | 
  66  |     try {
  67  |       await this.page.waitForFunction(
  68  |         () => {
  69  |           const chatList = document.querySelector('aside');
  70  |           const welcome = Array.from(document.querySelectorAll('h3')).some((el) =>
  71  |             el.textContent?.includes('Welcome to Twine')
  72  |           );
  73  |           const composer = document.querySelector(
  74  |             'input[placeholder="Write a message... (type @ai to query bot)"]'
  75  |           );
  76  |           return Boolean(chatList || welcome || composer);
  77  |         },
  78  |         { timeout: 45000 }
  79  |       );
  80  |     } catch (error) {
  81  |       const bodyText = (await this.page.locator('body').innerText().catch(() => ''))
  82  |         .replace(/\s+/g, ' ')
  83  |         .slice(0, 500);
  84  |       const authError = await this.page
  85  |         .locator('div:has-text("failed"), div:has-text("Invalid")')
  86  |         .first()
  87  |         .textContent()
  88  |         .catch(() => null);
  89  |       throw new Error(
  90  |         `Login for "${username}" did not reach the app shell. Auth error: ${authError || 'none'}. Body: ${bodyText}`
  91  |       );
  92  |     }
  93  | 
  94  |     await this.waitForWebSocketConnection();
  95  |   }
  96  | 
  97  |   async waitForWebSocketConnection(_timeout = 10000) {
  98  |     await this.page.waitForTimeout(2000);
  99  |   }
  100 | 
  101 |   async ensureChatReady() {
  102 |     if (await this.page.locator(SELECTORS.composer).isVisible().catch(() => false)) return;
  103 |     const startButton = this.page.locator(SELECTORS.startChatButton);
  104 |     if (await startButton.isVisible().catch(() => false)) {
  105 |       await startButton.click();
  106 |       await this.page.locator(SELECTORS.searchUsersInput).waitFor({ state: 'visible', timeout: 15000 });
  107 |       await this.page.locator(SELECTORS.searchUsersInput).fill('');
  108 |       await this.page.getByText(DEMO_USERS[1].displayName, { exact: true }).first().click();
  109 |     }
  110 |     await this.page.waitForSelector(SELECTORS.composer, { timeout: 15000 });
  111 |   }
  112 | 
  113 |   async sendMessage(text: string) {
  114 |     const composer = this.page.locator(SELECTORS.composer);
  115 |     await composer.waitFor({ state: 'visible', timeout: 15000 });
  116 |     await composer.fill(text);
  117 |     await this.page.keyboard.press('Enter');
  118 |     await this.page.waitForFunction(
  119 |       (sel) => {
  120 |         const el = document.querySelector(sel);
  121 |         return !!el && (el as HTMLInputElement).value === '';
  122 |       },
  123 |       SELECTORS.composer,
  124 |       { timeout: 10000 }
  125 |     );
  126 |   }
  127 | 
  128 |   async selectChat(contactName: string) {
  129 |     const chatList = this.page.locator(SELECTORS.chatList);
  130 |     const existingChat = chatList.locator('div.cursor-pointer').getByText(contactName, { exact: true }).first();
  131 | 
  132 |     if (await existingChat.isVisible().catch(() => false)) {
  133 |       await existingChat.click({ timeout: 15000 });
  134 |       await this.page.waitForSelector(SELECTORS.composer, { timeout: 15000 });
  135 |       return;
  136 |     }
  137 | 
  138 |     await this.startDirectChat(contactName);
  139 |   }
  140 | 
  141 |   async startDirectChat(displayName: string) {
  142 |     await this.page.click(SELECTORS.newChatButton, { timeout: 15000 });
  143 |     await this.page.locator(SELECTORS.searchUsersInput).waitFor({ state: 'visible', timeout: 15000 });
  144 |     await this.page.locator(SELECTORS.searchUsersInput).fill(displayName);
  145 |     await this.page.getByText(displayName, { exact: true }).first().click({ timeout: 15000 });
  146 |     await this.page.waitForSelector(SELECTORS.composer, { timeout: 15000 });
  147 |   }
  148 | 
  149 |   async waitForMessage(text: string, timeout = 20000) {
  150 |     await this.page.locator(`${SELECTORS.messageBubble}:has-text("${text}")`).first().waitFor({
  151 |       state: 'visible',
  152 |       timeout,
  153 |     });
  154 |   }
  155 | 
```