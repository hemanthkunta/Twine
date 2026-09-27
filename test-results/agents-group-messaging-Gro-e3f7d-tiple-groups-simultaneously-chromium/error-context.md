# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\group-messaging.test.ts >> Group Messaging Tests >> multiple groups simultaneously
- Location: tests\agents\group-messaging.test.ts:111:7

# Error details

```
TypeError: bob.waitForSelector is not a function
```

# Test source

```ts
  37  |   test('group message fan-out to all members', async ({ browser }) => {
  38  |     const agents = await createTestAgents(browser, 3, ['alice', 'bob', 'charlie']);
  39  |     const [alice, bob, charlie] = agents;
  40  |     
  41  |     try {
  42  |       await alice.navigateToApp();
  43  |       await bob.navigateToApp();
  44  |       await charlie.navigateToApp();
  45  |       
  46  |       await alice.login('alice');
  47  |       await bob.login('bob');
  48  |       await charlie.login('charlie');
  49  |       
  50  |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  51  |       
  52  |       const groupName = `Fanout Group ${Date.now()}`;
  53  |       await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
  54  |       
  55  |       const message = `Group message ${Date.now()}`;
  56  |       await alice.sendMessage(message);
  57  |       
  58  |       await alice.waitForMessage(message);
  59  |       await bob.waitForMessage(message);
  60  |       await charlie.waitForMessage(message);
  61  |       
  62  |       await expect(alice['page'].locator(`text=${message}`)).toBeVisible();
  63  |       await expect(bob['page'].locator(`text=${message}`)).toBeVisible();
  64  |       await expect(charlie['page'].locator(`text=${message}`)).toBeVisible();
  65  |     } finally {
  66  |       for (const agent of agents) {
  67  |         await agent['context'].close();
  68  |       }
  69  |     }
  70  |   });
  71  | 
  72  |   test('bob replies in group', async ({ browser }) => {
  73  |     const agents = await createTestAgents(browser, 3, ['alice', 'bob', 'charlie']);
  74  |     const [alice, bob, charlie] = agents;
  75  |     
  76  |     try {
  77  |       await alice.navigateToApp();
  78  |       await bob.navigateToApp();
  79  |       await charlie.navigateToApp();
  80  |       
  81  |       await alice.login('alice');
  82  |       await bob.login('bob');
  83  |       await charlie.login('charlie');
  84  |       
  85  |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  86  |       
  87  |       const groupName = `Reply Group ${Date.now()}`;
  88  |       await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
  89  |       
  90  |       await alice.sendMessage(`Alice starts ${Date.now()}`);
  91  |       
  92  |       await bob.waitForSelector(`text=${groupName}`, { timeout: 25000 });
  93  |       await bob.click(`text=${groupName}`);
  94  |       await bob['page'].waitForSelector(SELECTORS.composer, { timeout: 15000 });
  95  |       
  96  |       const reply = `Bob replies ${Date.now()}`;
  97  |       await bob.sendMessage(reply);
  98  |       
  99  |       await alice.waitForMessage(reply);
  100 |       await charlie.waitForMessage(reply);
  101 |       
  102 |       await expect(alice['page'].locator(`text=${reply}`)).toBeVisible();
  103 |       await expect(charlie['page'].locator(`text=${reply}`)).toBeVisible();
  104 |     } finally {
  105 |       for (const agent of agents) {
  106 |         await agent['context'].close();
  107 |       }
  108 |     }
  109 |   });
  110 | 
  111 |   test('multiple groups simultaneously', async ({ browser }) => {
  112 |     const agents = await createTestAgents(browser, 4, ['alice', 'bob', 'charlie', 'diana']);
  113 |     const [alice, bob, charlie, diana] = agents;
  114 |     
  115 |     try {
  116 |       for (const agent of agents) {
  117 |         await agent.navigateToApp();
  118 |       }
  119 |       await alice.login('alice');
  120 |       await bob.login('bob');
  121 |       await charlie.login('charlie');
  122 |       await diana.login('diana');
  123 |       
  124 |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  125 |       
  126 |       const group1 = `Group One ${Date.now()}`;
  127 |       const group2 = `Group Two ${Date.now()}`;
  128 |       
  129 |       await alice.createGroup(group1, ['Bob Vance']);
  130 |       await charlie.createGroup(group2, ['Diana Prince']);
  131 |       
  132 |       await Promise.all([
  133 |         alice.sendMessage(`Group 1 message ${Date.now()}`),
  134 |         charlie.sendMessage(`Group 2 message ${Date.now()}`),
  135 |       ]);
  136 |       
> 137 |       await bob.waitForSelector(`text=${group1}`, { timeout: 25000 });
      |                 ^ TypeError: bob.waitForSelector is not a function
  138 |       await diana.waitForSelector(`text=${group2}`, { timeout: 25000 });
  139 |       
  140 |       await expect(bob['page'].locator(`text=${group1}`)).toBeVisible();
  141 |       await expect(diana['page'].locator(`text=${group2}`)).toBeVisible();
  142 |     } finally {
  143 |       for (const agent of agents) {
  144 |         await agent['context'].close();
  145 |       }
  146 |     }
  147 |   });
  148 | 
  149 |   test('group message delivery receipts', async ({ browser }) => {
  150 |     const agents = await createTestAgents(browser, 3, ['alice', 'bob', 'charlie']);
  151 |     const [alice, bob, charlie] = agents;
  152 |     
  153 |     try {
  154 |       await alice.navigateToApp();
  155 |       await bob.navigateToApp();
  156 |       await charlie.navigateToApp();
  157 |       
  158 |       await alice.login('alice');
  159 |       await bob.login('bob');
  160 |       await charlie.login('charlie');
  161 |       
  162 |       await Promise.all(agents.map(a => a.waitForWebSocketConnection()));
  163 |       
  164 |       const groupName = `Receipt Group ${Date.now()}`;
  165 |       await alice.createGroup(groupName, ['Bob Vance', 'Charlie Brown']);
  166 |       
  167 |       const message = `Receipt test ${Date.now()}`;
  168 |       await alice.sendMessage(message);
  169 |       
  170 |       await alice.waitForMessage(message);
  171 |       await bob.waitForMessage(message);
  172 |       await charlie.waitForMessage(message);
  173 |       
  174 |       await expect(alice['page'].locator(SELECTORS.statusTicks)).toBeVisible();
  175 |     } finally {
  176 |       for (const agent of agents) {
  177 |         await agent['context'].close();
  178 |       }
  179 |     }
  180 |   });
  181 | });
```