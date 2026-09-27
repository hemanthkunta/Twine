# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\multi-device-sync.test.ts >> Multi-Device Sync Tests >> chat list sync across devices
- Location: tests\agents\multi-device-sync.test.ts:110:7

# Error details

```
TypeError: alice2.waitForSelector is not a function
```

# Test source

```ts
  28  |       await alice2.waitForMessage(message);
  29  |       await bob.waitForMessage(message);
  30  |       
  31  |       await expect(alice2['page'].locator(`text=${message}`)).toBeVisible();
  32  |       await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
  33  |     } finally {
  34  |       for (const agent of agents) {
  35  |         await agent['context'].close();
  36  |       }
  37  |     }
  38  |   });
  39  | 
  40  |   test('bob receives message on both devices', async ({ browser }) => {
  41  |     const agents = await createTestAgents(browser, 3, ['alice', 'bob-device1', 'bob-device2']);
  42  |     const [alice, bob1, bob2] = agents;
  43  |     
  44  |     try {
  45  |       await alice.navigateToApp();
  46  |       await bob1.navigateToApp();
  47  |       await bob2.navigateToApp();
  48  |       
  49  |       await alice.login('alice');
  50  |       await bob1.login('bob');
  51  |       await bob2.login('bob');
  52  |       
  53  |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  54  |       
  55  |       await alice.selectChat('Bob Vance');
  56  |       await bob1.selectChat('Alice Walker');
  57  |       await bob2.selectChat('Alice Walker');
  58  |       
  59  |       const message = `Bob sync ${Date.now()}`;
  60  |       await alice.sendMessage(message);
  61  |       
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
> 128 |       await alice2.waitForSelector(`text=${groupName}`, { timeout: 25000 });
      |                    ^ TypeError: alice2.waitForSelector is not a function
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
  162 |       await expect(typingIndicator).toBeVisible({ timeout: 5000 });
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