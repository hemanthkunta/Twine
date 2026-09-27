# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\parallel-runner.test.ts >> Parallel Agent Tests - Core Features >> simultaneous group creation
- Location: tests\agents\parallel-runner.test.ts:114:7

# Error details

```
"beforeAll" hook timeout of 60000ms exceeded.
```

```
Error: Login for "bob" did not reach the app shell. Auth error: none. Body: 
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e26]:
        - generic [ref=e27]: Twine
        - generic [ref=e28]: Couples & Friends
        - generic [ref=e29]: v3.0.4 • CLEAN-UI-NO-BANNERS
      - generic [ref=e31]: Cloud Connected
    - generic [ref=e34]:
      - button "Mesh Radar" [ref=e35]
      - button "Bridge" [ref=e40]
      - button "Settings & Themes" [ref=e48]
  - generic [ref=e52]:
    - complementary [ref=e54]:
      - generic [ref=e55]:
        - generic [ref=e56]:
          - generic [ref=e57]:
            - img "Alice Walker" [ref=e58]
            - generic "Online" [ref=e59]
          - generic [ref=e60]:
            - generic [ref=e61]:
              - generic [ref=e62]: Alice Walker
              - generic [ref=e63]: You
            - generic [ref=e64]: "@alice"
        - generic [ref=e65]:
          - button "Settings & Preferences" [ref=e66]
          - button "Switch User Account" [ref=e70]
          - button "Log Out" [ref=e73]
      - generic [ref=e77]:
        - generic [ref=e78]:
          - textbox "Search chats, groups, channels..." [ref=e83]
          - button "New Group / Channel" [ref=e84]
          - button "New Direct Message" [ref=e90]
        - generic [ref=e92]:
          - button "All" [ref=e93]
          - button "Direct" [ref=e94]
          - button "Groups" [ref=e95]
          - button "Channels" [ref=e96]
          - button "Unread" [ref=e97]
      - generic [ref=e98]:
        - button "Alice Walker Your Story" [ref=e99]:
          - img "Alice Walker" [ref=e102]
          - generic [ref=e105]: Your Story
        - button "Alice Alice" [ref=e106]:
          - img "Alice" [ref=e108]
          - generic [ref=e109]: Alice
        - button "Bob Bob" [ref=e110]:
          - img "Bob" [ref=e112]
          - generic [ref=e113]: Bob
      - generic [ref=e114]:
        - generic [ref=e115] [cursor=pointer]:
          - generic [ref=e116]:
            - img "Bob Vance" [ref=e117]
            - generic "Offline" [ref=e118]
          - generic [ref=e119]:
            - generic [ref=e120]:
              - generic [ref=e121]: Bob Vance
              - generic [ref=e123]: 06:13 AM
            - generic [ref=e124]:
              - generic [ref=e125]:
                - generic "Delivered" [ref=e126]
                - generic [ref=e130]: Alice->Bob concurrent 1790489581131
              - generic [ref=e131]: "1"
        - generic [ref=e132] [cursor=pointer]:
          - img "Sync Group 1790489518860" [ref=e134]
          - generic [ref=e135]:
            - generic [ref=e136]:
              - generic [ref=e137]:
                - generic [ref=e143]: Sync Group 1790489518860
                - generic "E2EE Encrypted" [ref=e144]
              - generic [ref=e147]: 06:12 AM
            - generic [ref=e149]:
              - generic "Sent" [ref=e150]
              - generic [ref=e153]: Group "Sync Group 1790489518860" created.
        - generic [ref=e154] [cursor=pointer]:
          - img "Group One 1790489459539" [ref=e156]
          - generic [ref=e157]:
            - generic [ref=e158]:
              - generic [ref=e159]:
                - generic [ref=e165]: Group One 1790489459539
                - generic "E2EE Encrypted" [ref=e166]
              - generic [ref=e169]: 06:11 AM
            - generic [ref=e171]:
              - generic "Sent" [ref=e172]
              - generic [ref=e175]: Group 1 message 1790489463625
        - generic [ref=e176] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e178]
          - generic [ref=e179]:
            - generic [ref=e180]:
              - generic [ref=e181]:
                - generic [ref=e187]: Dev Core Engineering
                - generic "E2EE Encrypted" [ref=e188]
              - generic [ref=e191]: Sep 26
            - generic [ref=e193]:
              - generic "Sent" [ref=e194]
              - generic [ref=e197]: Group "Dev Core Engineering" created.
        - generic [ref=e198] [cursor=pointer]:
          - img "Company Announcements" [ref=e200]
          - generic [ref=e201]:
            - generic [ref=e202]:
              - generic [ref=e203]:
                - generic [ref=e210]: Company Announcements
                - generic "E2EE Encrypted" [ref=e211]
              - generic [ref=e214]: Sep 26
            - generic [ref=e216]:
              - generic "Sent" [ref=e217]
              - generic [ref=e220]: Channel "Company Announcements" created.
        - generic [ref=e221] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e223]
          - generic [ref=e224]:
            - generic [ref=e225]:
              - generic [ref=e226]:
                - generic [ref=e232]: Dev Core Engineering
                - generic "E2EE Encrypted" [ref=e233]
              - generic [ref=e236]: Sep 19
            - generic [ref=e238]:
              - generic "Sent" [ref=e239]
              - generic [ref=e242]: Group "Dev Core Engineering" created.
        - generic [ref=e243] [cursor=pointer]:
          - img "Company Announcements" [ref=e245]
          - generic [ref=e246]:
            - generic [ref=e247]:
              - generic [ref=e248]:
                - generic [ref=e255]: Company Announcements
                - generic "E2EE Encrypted" [ref=e256]
              - generic [ref=e259]: Sep 19
            - generic [ref=e261]:
              - generic "Sent" [ref=e262]
              - generic [ref=e265]: Channel "Company Announcements" created.
        - generic [ref=e266] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e268]
          - generic [ref=e269]:
            - generic [ref=e270]:
              - generic [ref=e271]:
                - generic [ref=e277]: Dev Core Engineering
                - generic "E2EE Encrypted" [ref=e278]
              - generic [ref=e281]: Sep 19
            - generic [ref=e283]:
              - generic "Sent" [ref=e284]
              - generic [ref=e287]: Group "Dev Core Engineering" created.
        - generic [ref=e288] [cursor=pointer]:
          - img "Company Announcements" [ref=e290]
          - generic [ref=e291]:
            - generic [ref=e292]:
              - generic [ref=e293]:
                - generic [ref=e300]: Company Announcements
                - generic "E2EE Encrypted" [ref=e301]
              - generic [ref=e304]: Sep 19
            - generic [ref=e306]:
              - generic "Sent" [ref=e307]
              - generic [ref=e310]: Channel "Company Announcements" created.
        - generic [ref=e311] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e313]
          - generic [ref=e314]:
            - generic [ref=e315]:
              - generic [ref=e316]: Dev Core Engineering
              - generic [ref=e323]: Sep 16
            - generic [ref=e325]:
              - generic "Sent" [ref=e326]
              - generic [ref=e329]: Group "Dev Core Engineering" created.
        - generic [ref=e330] [cursor=pointer]:
          - img "Company Announcements" [ref=e332]
          - generic [ref=e333]:
            - generic [ref=e334]:
              - generic [ref=e335]: Company Announcements
              - generic [ref=e343]: Sep 16
            - generic [ref=e345]:
              - generic "Sent" [ref=e346]
              - generic [ref=e349]: Channel "Company Announcements" created.
        - generic [ref=e354] [cursor=pointer]:
          - generic [ref=e355]:
            - generic [ref=e356]:
              - generic [ref=e357]: Twine Vault (Saved Notes)
              - generic "E2EE Encrypted" [ref=e358]
            - generic [ref=e361]: Sep 15
          - generic [ref=e362]: No messages yet
        - generic [ref=e365] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e367]
          - generic [ref=e368]:
            - generic [ref=e369]:
              - generic [ref=e370]: Dev Core Engineering
              - generic [ref=e377]: Sep 15
            - generic [ref=e379]:
              - generic "Sent" [ref=e380]
              - generic [ref=e383]: Group "Dev Core Engineering" created.
        - generic [ref=e384] [cursor=pointer]:
          - img "Company Announcements" [ref=e386]
          - generic [ref=e387]:
            - generic [ref=e388]:
              - generic [ref=e389]: Company Announcements
              - generic [ref=e397]: Sep 15
            - generic [ref=e399]:
              - generic "Sent" [ref=e400]
              - generic [ref=e403]: Channel "Company Announcements" created.
    - main [ref=e404]:
      - generic [ref=e405]:
        - generic [ref=e410]:
          - heading "Twine Vault (Saved Notes)" [level=2] [ref=e412]
          - generic [ref=e414]:
            - generic [ref=e415]: 1 members
            - generic [ref=e416]: •
            - generic [ref=e417]:
              - generic [ref=e418] [cursor=pointer]: "#WebRTC"
              - generic [ref=e419] [cursor=pointer]: "#Security"
              - generic [ref=e420] [cursor=pointer]: "#MeshRelay"
              - generic [ref=e421] [cursor=pointer]: "#Architecture"
        - generic [ref=e422]:
          - button "Disappearing Messages Timer" [ref=e423]
          - button "P2P Mesh Radar & BLE Discovery" [ref=e426]
          - button "Search messages" [ref=e430]
          - button "More options (Search, Block, Clear, E2EE)" [ref=e435]
      - generic [ref=e443]:
        - generic [ref=e444]: 💬
        - paragraph [ref=e445]: No messages here yet...
        - paragraph [ref=e446]: Send a message to start the conversation!
      - generic [ref=e448]:
        - generic [ref=e449]: "AI Replies:"
        - button "Summarize" [ref=e454]
      - generic [ref=e461]:
        - button "Emojis" [ref=e462]
        - button "Attach file, image, or AI copilot" [ref=e466]
        - textbox "Write a message... (type @ai to query bot)" [active] [ref=e470]
        - button "Record Voice Note" [ref=e471]
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
  55  |     await this.page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
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
> 89  |       throw new Error(
      |             ^ Error: Login for "bob" did not reach the app shell. Auth error: none. Body: 
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
  163 |       await modal.getByText(member, { exact: true }).first().click({ timeout: 10000 });
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
```