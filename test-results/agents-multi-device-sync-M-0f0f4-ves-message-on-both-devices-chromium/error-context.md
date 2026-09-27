# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\multi-device-sync.test.ts >> Multi-Device Sync Tests >> bob receives message on both devices
- Location: tests\agents\multi-device-sync.test.ts:40:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Bob sync 1790489492238')
Expected: visible
Error: strict mode violation: locator('text=Bob sync 1790489492238') resolved to 2 elements:
    1) <span class="truncate">Bob sync 1790489492238</span> aka getByRole('complementary').getByText('Bob sync')
    2) <span>Bob sync 1790489492238</span> aka getByRole('main').getByText('Bob sync')

Call log:
  - Expect "toBeVisible" locator('text=Bob sync 1790489492238') with timeout 10000ms
  - waiting for locator('text=Bob sync 1790489492238')

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { TestAgent, DEMO_USERS, SELECTORS, createTestAgents } from './base';
  3   | 
  4   | test.describe('Multi-Device Sync Tests', () => {
  5   |   test('alice logs in on two devices - message sync', async ({ browser }) => {
  6   |     const agents = await createTestAgents(browser, 3, ['alice-device1', 'alice-device2', 'bob']);
  7   |     const [alice1, alice2, bob] = agents;
  8   |     
  9   |     try {
  10  |       await alice1.navigateToApp();
  11  |       await alice2.navigateToApp();
  12  |       await bob.navigateToApp();
  13  |       
  14  |       await alice1.login('alice');
  15  |       await alice2.login('alice');
  16  |       await bob.login('bob');
  17  |       
  18  |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  19  |       
  20  |       await alice1.selectChat('Bob Vance');
  21  |       await alice2.selectChat('Bob Vance');
  22  |       await bob.selectChat('Alice Walker');
  23  |       
  24  |       const message = `Sync test ${Date.now()}`;
  25  |       await alice1.sendMessage(message);
  26  |       
  27  |       await alice1.waitForMessage(message);
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
> 66  |       await expect(bob1['page'].locator(`text=${message}`)).toBeVisible();
      |                                                             ^ Error: expect(locator).toBeVisible() failed
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
  162 |       await expect(typingIndicator).toBeVisible({ timeout: 5000 });
  163 |       
  164 |       await alice1['page'].locator(SELECTORS.composer).fill('');
  165 |       
  166 |       await expect(typingIndicator).not.toBeVisible({ timeout: 5000 });
```