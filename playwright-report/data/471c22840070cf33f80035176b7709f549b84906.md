# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\multi-device-sync.test.ts >> Multi-Device Sync Tests >> typing indicator sync across devices
- Location: tests\agents\multi-device-sync.test.ts:140:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('header').locator('text=typing')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('header').locator('text=typing') with timeout 5000ms
  - waiting for locator('header').locator('text=typing')

```

```yaml
- banner:
  - img
  - img
  - img
  - text: Twine Couples & Friends v3.0.4 • CLEAN-UI-NO-BANNERS Cloud Connected
  - button "Mesh Radar":
    - img
    - text: Mesh Radar
  - button "Bridge":
    - img
    - text: Bridge
  - button "Settings & Themes":
    - img
- complementary:
  - img "Bob Vance"
  - text: Bob Vance You @bob
  - button "Settings & Preferences":
    - img
  - button "Switch User Account":
    - img
  - button "Log Out":
    - img
  - img
  - textbox "Search chats, groups, channels..."
  - button "New Group / Channel":
    - img
  - button "New Direct Message":
    - img
  - button "All"
  - button "Direct"
  - button "Groups"
  - button "Channels"
  - button "Unread"
  - button "Bob Vance Your Story":
    - img "Bob Vance"
    - img
    - text: Your Story
  - button "Alice Alice":
    - img "Alice"
    - text: Alice
  - button "Bob Bob":
    - img "Bob"
    - text: Bob
  - img
  - text: Twine Vault (Saved Notes)
  - img
  - text: Sep 17 No messages yet
  - img "Sync Group 1790489518860"
  - img
  - text: Sync Group 1790489518860
  - img
  - text: 06:12 AM Group "Sync Group 1790489518860" created. 1
  - img "Alice Walker"
  - text: Alice Walker 06:12 AM
  - img
  - text: Read receipt sync 1790489517823
  - img "Group One 1790489459539"
  - img
  - text: Group One 1790489459539
  - img
  - text: 06:11 AM Group 1 message 1790489463625 2
  - img "Dev Core Engineering"
  - img
  - text: Dev Core Engineering
  - img
  - text: Sep 26 Group "Dev Core Engineering" created. 1
  - img "Charlie Smith"
  - text: Charlie Smith Sep 26
  - img
  - text: Confidential secret between Bob and Charlie
  - img "Dev Core Engineering"
  - img
  - text: Dev Core Engineering
  - img
  - text: Sep 19 Group "Dev Core Engineering" created. 1
  - img "Dev Core Engineering"
  - img
  - text: Dev Core Engineering
  - img
  - text: Sep 19 Group "Dev Core Engineering" created. 1
  - img "Dev Core Engineering"
  - img
  - text: Dev Core Engineering Sep 16 Group "Dev Core Engineering" created. 1
  - img "Dev Core Engineering"
  - img
  - text: Dev Core Engineering Sep 15 Group "Dev Core Engineering" created. 1
- main:
  - img "Alice Walker"
  - heading "Alice Walker" [level=2]
  - img
  - text: E2EE last seen 5h ago
  - button "Disappearing Messages Timer":
    - img
  - button "Verify Safety Number & QR Code":
    - img
  - button "P2P Mesh Radar & BLE Discovery":
    - img
  - button "Voice Call (WebRTC)":
    - img
  - button "Video Call (WebRTC)":
    - img
  - button "Search messages":
    - img
  - button "More options (Search, Block, Clear, E2EE)":
    - img
  - text: September 11, 2026 Hey Alice! Twine messenger is live and running. Real-time WebSockets, WebRTC, and E2EE are ready to test! 🚀
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 01:04 PM
  - img
  - text: Alice Walker core smoke message
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 01:11 PM September 15, 2026 Alice Walker Updated content text This is a sub-thread reply to the parent message
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:47 PM
  - img
  - text: Alice Walker
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:47 PM Alice Walker Updated content text
  - button "1 reply":
    - img
    - text: 1 reply
  - img
  - text: 128 edited 06:47 PM September 16, 2026 Alice Walker Updated content text This is a sub-thread reply to the parent message
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 04:54 AM
  - img
  - text: Alice Walker
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 04:54 AM Alice Walker Updated content text
  - button "1 reply":
    - img
    - text: 1 reply
  - img
  - text: 128 edited 04:54 AM September 17, 2026 Alice Walker [Encrypted message — key unavailable]
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 09:06 AM Alice Walker [Encrypted message — key unavailable]
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 09:17 AM [Encrypted message — key unavailable]
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 09:21 AM
  - img
  - text: September 19, 2026 Alice Walker Updated content text This is a sub-thread reply to the parent message
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 03:43 PM
  - img
  - text: Alice Walker
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 03:43 PM Alice Walker Updated content text
  - button "1 reply":
    - img
    - text: 1 reply
  - img
  - text: 128 edited 03:43 PM Alice Walker Updated content text This is a sub-thread reply to the parent message
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 04:37 PM
  - img
  - text: Alice Walker
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 04:37 PM Alice Walker Updated content text
  - button "1 reply":
    - img
    - text: 1 reply
  - img
  - text: 128 edited 04:37 PM Yesterday Alice Walker Updated content text This is a sub-thread reply to the parent message
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 04:55 PM
  - img
  - text: Alice Walker
  - img
  - text: 📊 Anonymous Poll
  - img
  - heading "Which transport should we prioritize?" [level=4]
  - button "BLE Mesh 100%":
    - img
    - text: BLE Mesh 100%
  - button "LoRa Radio 0%"
  - button "WebSocket TLS 0%"
  - text: 1 vote Vote recorded ✓
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 04:55 PM Alice Walker Updated content text
  - button "1 reply":
    - img
    - text: 1 reply
  - img
  - text: 128 edited 04:55 PM Today Alice Walker Hello from Alice 1790488809007
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:00 AM Reply from Bob 1790488811158
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:00 AM
  - img
  - text: Alice Walker Alice message 0 - 1790488818188
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:00 AM Alice Walker Test receipts 1790488944656
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:02 AM Alice Walker Hello from Alice 1790489323825
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:08 AM Alice Walker Alice message 0 - 1790489324367
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:08 AM Alice Walker Test receipts 1790489373917
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:09 AM Alice Walker Alice->Bob 1790489401917
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:10 AM Alice Walker Bob sync 1790489492238
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:11 AM Read receipt sync 1790489517823
  - button "Reply in thread":
    - img
    - text: Reply in thread
  - img
  - text: 128 06:12 AM
  - img
  - img
  - text: "AI Replies:"
  - button "Summarize":
    - img
    - text: Summarize
  - button "Emojis":
    - img
  - button "Attach file, image, or AI copilot":
    - img
  - textbox "Write a message... (type @ai to query bot)"
  - button "Record Voice Note":
    - img
```

# Test source

```ts
  62  |       await alice.waitForMessage(message);
  63  |       await bob1.waitForMessage(message);
  64  |       await bob2.waitForMessage(message);
  65  |       
  66  |       await expect(bob1['page'].locator(`text=${message}`)).toBeVisible();
  67  |       await expect(bob2['page'].locator(`text=${message}`)).toBeVisible();
  68  |     } finally {
  69  |       for (const agent of agents) {
  70  |         await agent['context'].close();
  71  |       }
  72  |     }
  73  |   });
  74  | 
  75  |   test('read receipt sync across devices', async ({ browser }) => {
  76  |     const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
  77  |     const [alice1, alice2, bob] = agents;
  78  |     
  79  |     try {
  80  |       await alice1.navigateToApp();
  81  |       await alice2.navigateToApp();
  82  |       await bob.navigateToApp();
  83  |       
  84  |       await alice1.login('alice');
  85  |       await alice2.login('alice');
  86  |       await bob.login('bob');
  87  |       
  88  |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  89  |       
  90  |       await bob.selectChat('Alice Walker');
  91  |       await alice1.selectChat('Bob Vance');
  92  |       
  93  |       const message = `Read receipt sync ${Date.now()}`;
  94  |       await bob.sendMessage(message);
  95  |       
  96  |       await alice1.waitForMessage(message);
  97  |       await alice2.waitForMessage(message);
  98  |       
  99  |       await alice1['page'].click(`text=${message}`);
  100 |       await alice1['page'].waitForTimeout(1000);
  101 |       
  102 |       await expect(alice2['page'].locator(SELECTORS.statusTicks + ':has-text("read")')).toBeVisible({ timeout: 10000 });
  103 |     } finally {
  104 |       for (const agent of agents) {
  105 |         await agent['context'].close();
  106 |       }
  107 |     }
  108 |   });
  109 | 
  110 |   test('chat list sync across devices', async ({ browser }) => {
  111 |     const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
  112 |     const [alice1, alice2, bob] = agents;
  113 |     
  114 |     try {
  115 |       await alice1.navigateToApp();
  116 |       await alice2.navigateToApp();
  117 |       await bob.navigateToApp();
  118 |       
  119 |       await alice1.login('alice');
  120 |       await alice2.login('alice');
  121 |       await bob.login('bob');
  122 |       
  123 |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  124 |       
  125 |       const groupName = `Sync Group ${Date.now()}`;
  126 |       await alice1.createGroup(groupName, ['Bob Vance']);
  127 |       
  128 |       await alice2.waitForSelector(`text=${groupName}`, { timeout: 25000 });
  129 |       await expect(alice2['page'].locator(`text=${groupName}`)).toBeVisible();
  130 |       
  131 |       await bob.waitForSelector(`text=${groupName}`, { timeout: 25000 });
  132 |       await expect(bob['page'].locator(`text=${groupName}`)).toBeVisible();
  133 |     } finally {
  134 |       for (const agent of agents) {
  135 |         await agent['context'].close();
  136 |       }
  137 |     }
  138 |   });
  139 | 
  140 |   test('typing indicator sync across devices', async ({ browser }) => {
  141 |     const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
  142 |     const [alice1, alice2, bob] = agents;
  143 |     
  144 |     try {
  145 |       await alice1.navigateToApp();
  146 |       await alice2.navigateToApp();
  147 |       await bob.navigateToApp();
  148 |       
  149 |       await alice1.login('alice');
  150 |       await alice2.login('alice');
  151 |       await bob.login('bob');
  152 |       
  153 |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  154 |       
  155 |       await bob.selectChat('Alice Walker');
  156 |       await alice1.selectChat('Bob Vance');
  157 |       await alice2.selectChat('Bob Vance');
  158 |       
  159 |       await alice1['page'].locator(SELECTORS.composer).fill('Typing on device 1');
  160 |       
  161 |       const typingIndicator = bob['page'].locator(SELECTORS.typingIndicator);
> 162 |       await expect(typingIndicator).toBeVisible({ timeout: 5000 });
      |                                     ^ Error: expect(locator).toBeVisible() failed
  163 |       
  164 |       await alice1['page'].locator(SELECTORS.composer).fill('');
  165 |       
  166 |       await expect(typingIndicator).not.toBeVisible({ timeout: 5000 });
  167 |     } finally {
  168 |       for (const agent of agents) {
  169 |         await agent['context'].close();
  170 |       }
  171 |     }
  172 |   });
  173 | 
  174 |   test('message order consistency across devices', async ({ browser }) => {
  175 |     const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
  176 |     const [alice1, alice2, bob] = agents;
  177 |     
  178 |     try {
  179 |       await alice1.navigateToApp();
  180 |       await alice2.navigateToApp();
  181 |       await bob.navigateToApp();
  182 |       
  183 |       await alice1.login('alice');
  184 |       await alice2.login('alice');
  185 |       await bob.login('bob');
  186 |       
  187 |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  188 |       
  189 |       await alice1.selectChat('Bob Vance');
  190 |       await alice2.selectChat('Bob Vance');
  191 |       await bob.selectChat('Alice Walker');
  192 |       
  193 |       const messages = [
  194 |         `Msg 1 ${Date.now()}`,
  195 |         `Msg 2 ${Date.now()}`,
  196 |         `Msg 3 ${Date.now()}`,
  197 |         `Msg 4 ${Date.now()}`,
  198 |         `Msg 5 ${Date.now()}`,
  199 |       ];
  200 |       
  201 |       for (const msg of messages) {
  202 |         await alice1.sendMessage(msg);
  203 |       }
  204 |       
  205 |       await bob.waitForMessage(messages[messages.length - 1]);
  206 |       await alice2.waitForMessage(messages[messages.length - 1]);
  207 |       
  208 |       const bobMessages = await bob['page'].locator(SELECTORS.messageBubble).allInnerTexts();
  209 |       const alice2Messages = await alice2['page'].locator(SELECTORS.messageBubble).allInnerTexts();
  210 |       
  211 |       const bobOrdered = bobMessages.filter(m => messages.some(msg => m.includes(msg)));
  212 |       const alice2Ordered = alice2Messages.filter(m => messages.some(msg => m.includes(msg)));
  213 |       
  214 |       expect(bobOrdered).toEqual(alice2Ordered);
  215 |     } finally {
  216 |       for (const agent of agents) {
  217 |         await agent['context'].close();
  218 |       }
  219 |     }
  220 |   });
  221 | });
```