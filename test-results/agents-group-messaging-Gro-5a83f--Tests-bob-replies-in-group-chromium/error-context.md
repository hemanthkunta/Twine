# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\group-messaging.test.ts >> Group Messaging Tests >> bob replies in group
- Location: tests\agents\group-messaging.test.ts:72:7

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('div.fixed.inset-0:has-text("Create")').getByText('Charlie Brown', { exact: true }).first()

```

# Test source

```ts
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
  156 |   async createGroup(groupName: string, members: string[]) {
  157 |     await this.page.click(SELECTORS.newGroupButton, { timeout: 15000 });
  158 |     const modal = this.page.locator('div.fixed.inset-0:has-text("Create")');
  159 |     await modal.waitFor({ state: 'visible', timeout: 15000 });
  160 |     await modal.locator('input[type="text"]').first().fill(groupName);
  161 | 
  162 |     for (const member of members) {
> 163 |       await modal.getByText(member, { exact: true }).first().click({ timeout: 10000 });
      |                                                              ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  164 |     }
  165 | 
  166 |     await modal.locator('button[type="submit"]').click();
  167 |     await this.page.waitForSelector(SELECTORS.composer, { timeout: 20000 });
  168 |   }
  169 | 
  170 |   async takeScreenshot(name: string) {
  171 |     fs.mkdirSync('test-results/screenshots', { recursive: true });
  172 |     await this.page.screenshot({ path: `test-results/screenshots/${this.name}-${name}.png`, fullPage: true });
  173 |   }
  174 | 
  175 |   getName() {
  176 |     return this.name;
  177 |   }
  178 | }
  179 | 
  180 | export class MultiAgentTestRunner {
  181 |   private agents: TestAgent[] = [];
  182 | 
  183 |   addAgent(agent: TestAgent) {
  184 |     this.agents.push(agent);
  185 |   }
  186 | 
  187 |   getAgents() {
  188 |     return this.agents;
  189 |   }
  190 | 
  191 |   async runAll(fn: (agent: TestAgent) => Promise<void>) {
  192 |     await Promise.all(this.agents.map((agent) => fn(agent)));
  193 |   }
  194 | 
  195 |   async runSequential(fn: (agent: TestAgent, index: number) => Promise<void>) {
  196 |     for (let i = 0; i < this.agents.length; i++) {
  197 |       await fn(this.agents[i], i);
  198 |     }
  199 |   }
  200 | }
  201 | 
  202 | export async function createTestAgents(
  203 |   browser: any,
  204 |   count: number,
  205 |   names: string[]
  206 | ): Promise<TestAgent[]> {
  207 |   const agents: TestAgent[] = [];
  208 |   for (let i = 0; i < count; i++) {
  209 |     const context = await browser.newContext();
  210 |     const page = await context.newPage();
  211 |     agents.push(new TestAgent(page, context, names[i] || `agent-${i}`));
  212 |   }
  213 |   return agents;
  214 | }
```