# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\direct-messaging.test.ts >> Direct Messaging Tests >> bob replies to alice
- Location: tests\agents\direct-messaging.test.ts:35:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Reply from Bob 1790489327316')
Expected: visible
Error: strict mode violation: locator('text=Reply from Bob 1790489327316') resolved to 2 elements:
    1) <span class="truncate">Reply from Bob 1790489327316</span> aka getByRole('complementary').getByText('Reply from Bob')
    2) <span>Reply from Bob 1790489327316</span> aka getByRole('main').getByText('Reply from Bob 1790489327316')

Call log:
  - Expect "toBeVisible" locator('text=Reply from Bob 1790489327316') with timeout 10000ms
  - waiting for locator('text=Reply from Bob 1790489327316')

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { TestAgent, DEMO_USERS, SELECTORS, createTestAgents } from './base';
  3   | 
  4   | test.describe('Direct Messaging Tests', () => {
  5   |   test('alice sends message to bob', async ({ browser }) => {
  6   |     const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
  7   |     const [alice, bob] = agents;
  8   |     
  9   |     try {
  10  |       await alice.navigateToApp();
  11  |       await bob.navigateToApp();
  12  |       await alice.login('alice');
  13  |       await bob.login('bob');
  14  |       
  15  |       await alice.waitForWebSocketConnection();
  16  |       await bob.waitForWebSocketConnection();
  17  |       
  18  |       await alice.selectChat('Bob Vance');
  19  |       
  20  |       const message = `Hello from Alice ${Date.now()}`;
  21  |       await alice.sendMessage(message);
  22  |       
  23  |       await alice.waitForMessage(message);
  24  |       await expect(alice['page'].locator(`text=${message}`)).toBeVisible();
  25  |       
  26  |       await bob.waitForMessage(message);
  27  |       await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
  28  |     } finally {
  29  |       for (const agent of agents) {
  30  |         await agent['context'].close();
  31  |       }
  32  |     }
  33  |   });
  34  | 
  35  |   test('bob replies to alice', async ({ browser }) => {
  36  |     const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
  37  |     const [alice, bob] = agents;
  38  |     
  39  |     try {
  40  |       await alice.navigateToApp();
  41  |       await bob.navigateToApp();
  42  |       await alice.login('alice');
  43  |       await bob.login('bob');
  44  |       
  45  |       await alice.waitForWebSocketConnection();
  46  |       await bob.waitForWebSocketConnection();
  47  |       
  48  |       await bob.selectChat('Alice Walker');
  49  |       
  50  |       const message = `Reply from Bob ${Date.now()}`;
  51  |       await bob.sendMessage(message);
  52  |       
  53  |       await bob.waitForMessage(message);
> 54  |       await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
      |                                                            ^ Error: expect(locator).toBeVisible() failed
  55  |       
  56  |       await alice.waitForMessage(message);
  57  |       await expect(alice['page'].locator(`text=${message}`)).toBeVisible();
  58  |     } finally {
  59  |       for (const agent of agents) {
  60  |         await agent['context'].close();
  61  |       }
  62  |     }
  63  |   });
  64  | 
  65  |   test('bidirectional conversation', async ({ browser }) => {
  66  |     const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
  67  |     const [alice, bob] = agents;
  68  |     
  69  |     try {
  70  |       await alice.navigateToApp();
  71  |       await bob.navigateToApp();
  72  |       await alice.login('alice');
  73  |       await bob.login('bob');
  74  |       
  75  |       await alice.waitForWebSocketConnection();
  76  |       await bob.waitForWebSocketConnection();
  77  |       
  78  |       await alice.selectChat('Bob Vance');
  79  |       
  80  |       for (let i = 0; i < 5; i++) {
  81  |         const fromAlice = `Alice message ${i} - ${Date.now()}`;
  82  |         await alice.sendMessage(fromAlice);
  83  |         await alice.waitForMessage(fromAlice);
  84  |         await bob.waitForMessage(fromAlice);
  85  |         
  86  |         const fromBob = `Bob reply ${i} - ${Date.now()}`;
  87  |         await bob.sendMessage(fromBob);
  88  |         await bob.waitForMessage(fromBob);
  89  |         await alice.waitForMessage(fromBob);
  90  |       }
  91  |       
  92  |       const aliceMessages = await alice['page'].locator(SELECTORS.messageBubble).count();
  93  |       const bobMessages = await bob['page'].locator(SELECTORS.messageBubble).count();
  94  |       
  95  |       expect(aliceMessages).toBeGreaterThanOrEqual(5);
  96  |       expect(bobMessages).toBeGreaterThanOrEqual(5);
  97  |     } finally {
  98  |       for (const agent of agents) {
  99  |         await agent['context'].close();
  100 |       }
  101 |     }
  102 |   });
  103 | 
  104 |   test('message delivery receipts', async ({ browser }) => {
  105 |     const agents = await createTestAgents(browser, 2, ['alice', 'bob']);
  106 |     const [alice, bob] = agents;
  107 |     
  108 |     try {
  109 |       await alice.navigateToApp();
  110 |       await bob.navigateToApp();
  111 |       await alice.login('alice');
  112 |       await bob.login('bob');
  113 |       
  114 |       await alice.waitForWebSocketConnection();
  115 |       await bob.waitForWebSocketConnection();
  116 |       
  117 |       await alice.selectChat('Bob Vance');
  118 |       
  119 |       const message = `Test receipts ${Date.now()}`;
  120 |       await alice.sendMessage(message);
  121 |       
  122 |       await alice.waitForMessage(message);
  123 |       await bob.waitForMessage(message);
  124 |       
  125 |       await expect(alice['page'].locator(SELECTORS.statusTicks)).toBeVisible();
  126 |     } finally {
  127 |       for (const agent of agents) {
  128 |         await agent['context'].close();
  129 |       }
  130 |     }
  131 |   });
  132 | 
  133 |   test('multiple concurrent conversations', async ({ browser }) => {
  134 |     const agents = await createTestAgents(browser, 4, ['alice', 'bob', 'charlie', 'diana']);
  135 |     const [alice, bob, charlie, diana] = agents;
  136 |     
  137 |     try {
  138 |       for (const agent of agents) {
  139 |         await agent.navigateToApp();
  140 |       }
  141 |       await alice.login('alice');
  142 |       await bob.login('bob');
  143 |       await charlie.login('charlie');
  144 |       await diana.login('diana');
  145 |       
  146 |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  147 |       
  148 |       await alice.selectChat('Bob Vance');
  149 |       await charlie.selectChat('Diana Prince');
  150 |       
  151 |       const msg1 = `Alice->Bob ${Date.now()}`;
  152 |       const msg2 = `Charlie->Diana ${Date.now()}`;
  153 |       
  154 |       await Promise.all([
```