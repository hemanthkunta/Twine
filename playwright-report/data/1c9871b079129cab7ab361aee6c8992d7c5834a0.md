# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: agents\parallel-runner.test.ts >> Parallel Agent Tests - Stress >> long-running conversation persistence
- Location: tests\agents\parallel-runner.test.ts:222:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
Call log:
  - waiting for locator('.msg-bubble:has-text("Round 0 msg 0 1790489600819")').first() to be visible

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
        - generic [ref=e119] [cursor=pointer]:
          - generic [ref=e120]:
            - generic [ref=e121]:
              - generic [ref=e122]: Twine Vault (Saved Notes)
              - generic "E2EE Encrypted" [ref=e123]
            - generic [ref=e126]: Sep 15
          - generic [ref=e127]: No messages yet
        - generic [ref=e130] [cursor=pointer]:
          - generic [ref=e131]:
            - img "Bob Vance" [ref=e132]
            - generic "Online" [ref=e1259]
          - generic [ref=e134]:
            - generic [ref=e135]:
              - generic [ref=e136]: Bob Vance
              - generic [ref=e138]: 06:13 AM
            - generic [ref=e140]:
              - generic "Sent" [ref=e141]
              - generic [ref=e144]: Round 0 msg 0 1790489600819
        - generic [ref=e145] [cursor=pointer]:
          - img "Sync Group 1790489518860" [ref=e147]
          - generic [ref=e148]:
            - generic [ref=e149]:
              - generic [ref=e150]:
                - generic [ref=e156]: Sync Group 1790489518860
                - generic "E2EE Encrypted" [ref=e157]
              - generic [ref=e160]: 06:12 AM
            - generic [ref=e162]:
              - generic "Sent" [ref=e163]
              - generic [ref=e166]: Group "Sync Group 1790489518860" created.
        - generic [ref=e167] [cursor=pointer]:
          - img "Group One 1790489459539" [ref=e169]
          - generic [ref=e170]:
            - generic [ref=e171]:
              - generic [ref=e172]:
                - generic [ref=e178]: Group One 1790489459539
                - generic "E2EE Encrypted" [ref=e179]
              - generic [ref=e182]: 06:11 AM
            - generic [ref=e184]:
              - generic "Sent" [ref=e185]
              - generic [ref=e188]: Group 1 message 1790489463625
        - generic [ref=e189] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e191]
          - generic [ref=e192]:
            - generic [ref=e193]:
              - generic [ref=e194]:
                - generic [ref=e200]: Dev Core Engineering
                - generic "E2EE Encrypted" [ref=e201]
              - generic [ref=e204]: Sep 26
            - generic [ref=e206]:
              - generic "Sent" [ref=e207]
              - generic [ref=e210]: Group "Dev Core Engineering" created.
        - generic [ref=e211] [cursor=pointer]:
          - img "Company Announcements" [ref=e213]
          - generic [ref=e214]:
            - generic [ref=e215]:
              - generic [ref=e216]:
                - generic [ref=e223]: Company Announcements
                - generic "E2EE Encrypted" [ref=e224]
              - generic [ref=e227]: Sep 26
            - generic [ref=e229]:
              - generic "Sent" [ref=e230]
              - generic [ref=e233]: Channel "Company Announcements" created.
        - generic [ref=e234] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e236]
          - generic [ref=e237]:
            - generic [ref=e238]:
              - generic [ref=e239]:
                - generic [ref=e245]: Dev Core Engineering
                - generic "E2EE Encrypted" [ref=e246]
              - generic [ref=e249]: Sep 19
            - generic [ref=e251]:
              - generic "Sent" [ref=e252]
              - generic [ref=e255]: Group "Dev Core Engineering" created.
        - generic [ref=e256] [cursor=pointer]:
          - img "Company Announcements" [ref=e258]
          - generic [ref=e259]:
            - generic [ref=e260]:
              - generic [ref=e261]:
                - generic [ref=e268]: Company Announcements
                - generic "E2EE Encrypted" [ref=e269]
              - generic [ref=e272]: Sep 19
            - generic [ref=e274]:
              - generic "Sent" [ref=e275]
              - generic [ref=e278]: Channel "Company Announcements" created.
        - generic [ref=e279] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e281]
          - generic [ref=e282]:
            - generic [ref=e283]:
              - generic [ref=e284]:
                - generic [ref=e290]: Dev Core Engineering
                - generic "E2EE Encrypted" [ref=e291]
              - generic [ref=e294]: Sep 19
            - generic [ref=e296]:
              - generic "Sent" [ref=e297]
              - generic [ref=e300]: Group "Dev Core Engineering" created.
        - generic [ref=e301] [cursor=pointer]:
          - img "Company Announcements" [ref=e303]
          - generic [ref=e304]:
            - generic [ref=e305]:
              - generic [ref=e306]:
                - generic [ref=e313]: Company Announcements
                - generic "E2EE Encrypted" [ref=e314]
              - generic [ref=e317]: Sep 19
            - generic [ref=e319]:
              - generic "Sent" [ref=e320]
              - generic [ref=e323]: Channel "Company Announcements" created.
        - generic [ref=e324] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e326]
          - generic [ref=e327]:
            - generic [ref=e328]:
              - generic [ref=e329]: Dev Core Engineering
              - generic [ref=e336]: Sep 16
            - generic [ref=e338]:
              - generic "Sent" [ref=e339]
              - generic [ref=e342]: Group "Dev Core Engineering" created.
        - generic [ref=e343] [cursor=pointer]:
          - img "Company Announcements" [ref=e345]
          - generic [ref=e346]:
            - generic [ref=e347]:
              - generic [ref=e348]: Company Announcements
              - generic [ref=e356]: Sep 16
            - generic [ref=e358]:
              - generic "Sent" [ref=e359]
              - generic [ref=e362]: Channel "Company Announcements" created.
        - generic [ref=e363] [cursor=pointer]:
          - img "Dev Core Engineering" [ref=e365]
          - generic [ref=e366]:
            - generic [ref=e367]:
              - generic [ref=e368]: Dev Core Engineering
              - generic [ref=e375]: Sep 15
            - generic [ref=e377]:
              - generic "Sent" [ref=e378]
              - generic [ref=e381]: Group "Dev Core Engineering" created.
        - generic [ref=e382] [cursor=pointer]:
          - img "Company Announcements" [ref=e384]
          - generic [ref=e385]:
            - generic [ref=e386]:
              - generic [ref=e387]: Company Announcements
              - generic [ref=e395]: Sep 15
            - generic [ref=e397]:
              - generic "Sent" [ref=e398]
              - generic [ref=e401]: Channel "Company Announcements" created.
    - main [ref=e402]:
      - generic [ref=e403]:
        - generic [ref=e404]:
          - generic [ref=e405]:
            - img "Bob Vance" [ref=e406]
            - generic "Online" [ref=e1260]
          - generic [ref=e408]:
            - generic [ref=e409]:
              - heading "Bob Vance" [level=2] [ref=e410]
              - generic [ref=e411]: E2EE
            - generic [ref=e416]: online
        - generic [ref=e418]:
          - button "Disappearing Messages Timer" [ref=e419]
          - button "Verify Safety Number & QR Code" [ref=e422]
          - button "P2P Mesh Radar & BLE Discovery" [ref=e426]
          - button "Voice Call (WebRTC)" [ref=e430]
          - button "Video Call (WebRTC)" [ref=e433]
          - button "Search messages" [ref=e437]
          - button "More options (Search, Block, Clear, E2EE)" [ref=e442]
      - generic [ref=e449]:
        - generic [ref=e450]:
          - generic [ref=e451]: September 11, 2026
          - generic [ref=e454]:
            - generic [ref=e455]: Bob Vance
            - generic [ref=e457]: Hey Alice! Twine messenger is live and running. Real-time WebSockets, WebRTC, and E2EE are ready to test! 🚀
            - button "Reply in thread" [ref=e460]
            - generic [ref=e464]:
              - generic [ref=e465]: "128"
              - generic [ref=e470]: 01:04 PM
          - generic [ref=e472]:
            - generic [ref=e473]: core smoke message
            - button "Reply in thread" [ref=e476]
            - generic [ref=e480]:
              - generic [ref=e481]: "128"
              - generic [ref=e486]: 01:11 PM
              - generic "Read" [ref=e487]
        - generic [ref=e491]:
          - generic [ref=e492]: September 15, 2026
          - generic [ref=e495]:
            - generic [ref=e496]: Bob Vance
            - generic [ref=e498]:
              - generic [ref=e499]: Alice Walker
              - generic [ref=e500]: Updated content text
            - generic [ref=e501]: This is a sub-thread reply to the parent message
            - button "Reply in thread" [ref=e504]
            - generic [ref=e508]:
              - generic [ref=e509]: "128"
              - generic [ref=e514]: 06:47 PM
          - generic [ref=e516]:
            - button "Reply in thread" [ref=e518]
            - generic [ref=e522]:
              - generic [ref=e523]: "128"
              - generic [ref=e528]: 06:47 PM
              - generic "Read" [ref=e529]
          - generic [ref=e534]:
            - generic [ref=e535]: Updated content text
            - button "1 reply" [ref=e538]
            - generic [ref=e542]:
              - generic [ref=e543]: "128"
              - generic [ref=e548]: edited
              - generic [ref=e549]: 06:47 PM
              - generic "Read" [ref=e550]
        - generic [ref=e554]:
          - generic [ref=e555]: September 16, 2026
          - generic [ref=e558]:
            - generic [ref=e559]: Bob Vance
            - generic [ref=e561]:
              - generic [ref=e562]: Alice Walker
              - generic [ref=e563]: Updated content text
            - generic [ref=e564]: This is a sub-thread reply to the parent message
            - button "Reply in thread" [ref=e567]
            - generic [ref=e571]:
              - generic [ref=e572]: "128"
              - generic [ref=e577]: 04:54 AM
          - generic [ref=e579]:
            - button "Reply in thread" [ref=e581]
            - generic [ref=e585]:
              - generic [ref=e586]: "128"
              - generic [ref=e591]: 04:54 AM
              - generic "Read" [ref=e592]
          - generic [ref=e597]:
            - generic [ref=e598]: Updated content text
            - button "1 reply" [ref=e601]
            - generic [ref=e605]:
              - generic [ref=e606]: "128"
              - generic [ref=e611]: edited
              - generic [ref=e612]: 04:54 AM
              - generic "Read" [ref=e613]
        - generic [ref=e617]:
          - generic [ref=e618]: September 17, 2026
          - generic [ref=e621]:
            - generic [ref=e622]: "[Encrypted message — key unavailable]"
            - button "Reply in thread" [ref=e625]
            - generic [ref=e629]:
              - generic [ref=e630]: "128"
              - generic [ref=e635]: 09:06 AM
              - generic "Read" [ref=e636]
          - generic [ref=e641]:
            - generic [ref=e642]: "[Encrypted message — key unavailable]"
            - button "Reply in thread" [ref=e645]
            - generic [ref=e649]:
              - generic [ref=e650]: "128"
              - generic [ref=e655]: 09:17 AM
              - generic "Read" [ref=e656]
          - generic [ref=e661]:
            - generic [ref=e662]: Bob Vance
            - generic [ref=e664]: "[Encrypted message — key unavailable]"
            - button "Reply in thread" [ref=e667]
            - generic [ref=e671]:
              - generic [ref=e672]: "128"
              - generic [ref=e677]: 09:21 AM
        - generic [ref=e678]:
          - generic [ref=e679]: September 19, 2026
          - generic [ref=e682]:
            - generic [ref=e683]: Bob Vance
            - generic [ref=e685]:
              - generic [ref=e686]: Alice Walker
              - generic [ref=e687]: Updated content text
            - generic [ref=e688]: This is a sub-thread reply to the parent message
            - button "Reply in thread" [ref=e691]
            - generic [ref=e695]:
              - generic [ref=e696]: "128"
              - generic [ref=e701]: 03:43 PM
          - generic [ref=e703]:
            - button "Reply in thread" [ref=e705]
            - generic [ref=e709]:
              - generic [ref=e710]: "128"
              - generic [ref=e715]: 03:43 PM
              - generic "Read" [ref=e716]
          - generic [ref=e721]:
            - generic [ref=e722]: Updated content text
            - button "1 reply" [ref=e725]
            - generic [ref=e729]:
              - generic [ref=e730]: "128"
              - generic [ref=e735]: edited
              - generic [ref=e736]: 03:43 PM
              - generic "Read" [ref=e737]
          - generic [ref=e742]:
            - generic [ref=e743]: Bob Vance
            - generic [ref=e745]:
              - generic [ref=e746]: Alice Walker
              - generic [ref=e747]: Updated content text
            - generic [ref=e748]: This is a sub-thread reply to the parent message
            - button "Reply in thread" [ref=e751]
            - generic [ref=e755]:
              - generic [ref=e756]: "128"
              - generic [ref=e761]: 04:37 PM
          - generic [ref=e763]:
            - button "Reply in thread" [ref=e765]
            - generic [ref=e769]:
              - generic [ref=e770]: "128"
              - generic [ref=e775]: 04:37 PM
              - generic "Read" [ref=e776]
          - generic [ref=e781]:
            - generic [ref=e782]: Updated content text
            - button "1 reply" [ref=e785]
            - generic [ref=e789]:
              - generic [ref=e790]: "128"
              - generic [ref=e795]: edited
              - generic [ref=e796]: 04:37 PM
              - generic "Read" [ref=e797]
        - generic [ref=e801]:
          - generic [ref=e802]: Yesterday
          - generic [ref=e805]:
            - generic [ref=e806]: Bob Vance
            - generic [ref=e808]:
              - generic [ref=e809]: Alice Walker
              - generic [ref=e810]: Updated content text
            - generic [ref=e811]: This is a sub-thread reply to the parent message
            - button "Reply in thread" [ref=e814]
            - generic [ref=e818]:
              - generic [ref=e819]: "128"
              - generic [ref=e824]: 04:55 PM
          - generic [ref=e826]:
            - generic [ref=e827]:
              - generic [ref=e828]:
                - generic [ref=e829]: 📊 Anonymous Poll
                - heading "Which transport should we prioritize?" [level=4] [ref=e838]
              - generic [ref=e839]:
                - button "BLE Mesh" [ref=e840]
                - button "LoRa Radio" [ref=e845]
                - button "WebSocket TLS" [ref=e850]
              - generic [ref=e855]:
                - generic [ref=e856]: 1 vote
                - generic [ref=e857]: Click to vote
            - button "Reply in thread" [ref=e859]
            - generic [ref=e863]:
              - generic [ref=e864]: "128"
              - generic [ref=e869]: 04:55 PM
              - generic "Read" [ref=e870]
          - generic [ref=e875]:
            - generic [ref=e876]: Updated content text
            - button "1 reply" [ref=e879]
            - generic [ref=e883]:
              - generic [ref=e884]: "128"
              - generic [ref=e889]: edited
              - generic [ref=e890]: 04:55 PM
              - generic "Read" [ref=e891]
        - generic [ref=e895]:
          - generic [ref=e896]: Today
          - generic [ref=e899]:
            - generic [ref=e900]: Hello from Alice 1790488809007
            - button "Reply in thread" [ref=e903]
            - generic [ref=e907]:
              - generic [ref=e908]: "128"
              - generic [ref=e913]: 06:00 AM
              - generic "Read" [ref=e914]
          - generic [ref=e919]:
            - generic [ref=e920]: Bob Vance
            - generic [ref=e922]: Reply from Bob 1790488811158
            - button "Reply in thread" [ref=e925]
            - generic [ref=e929]:
              - generic [ref=e930]: "128"
              - generic [ref=e935]: 06:00 AM
          - generic [ref=e937]:
            - generic [ref=e938]: Alice message 0 - 1790488818188
            - button "Reply in thread" [ref=e941]
            - generic [ref=e945]:
              - generic [ref=e946]: "128"
              - generic [ref=e951]: 06:00 AM
              - generic "Read" [ref=e952]
          - generic [ref=e957]:
            - generic [ref=e958]: Test receipts 1790488944656
            - button "Reply in thread" [ref=e961]
            - generic [ref=e965]:
              - generic [ref=e966]: "128"
              - generic [ref=e971]: 06:02 AM
              - generic "Read" [ref=e972]
          - generic [ref=e977]:
            - generic [ref=e978]: Hello from Alice 1790489323825
            - button "Reply in thread" [ref=e981]
            - generic [ref=e985]:
              - generic [ref=e986]: "128"
              - generic [ref=e991]: 06:08 AM
              - generic "Read" [ref=e992]
          - generic [ref=e997]:
            - generic [ref=e998]: Alice message 0 - 1790489324367
            - button "Reply in thread" [ref=e1001]
            - generic [ref=e1005]:
              - generic [ref=e1006]: "128"
              - generic [ref=e1011]: 06:08 AM
              - generic "Read" [ref=e1012]
          - generic [ref=e1017]:
            - generic [ref=e1018]: Test receipts 1790489373917
            - button "Reply in thread" [ref=e1021]
            - generic [ref=e1025]:
              - generic [ref=e1026]: "128"
              - generic [ref=e1031]: 06:09 AM
              - generic "Read" [ref=e1032]
          - generic [ref=e1037]:
            - generic [ref=e1038]: Alice->Bob 1790489401917
            - button "Reply in thread" [ref=e1041]
            - generic [ref=e1045]:
              - generic [ref=e1046]: "128"
              - generic [ref=e1051]: 06:10 AM
              - generic "Read" [ref=e1052]
          - generic [ref=e1057]:
            - generic [ref=e1058]: Bob sync 1790489492238
            - button "Reply in thread" [ref=e1061]
            - generic [ref=e1065]:
              - generic [ref=e1066]: "128"
              - generic [ref=e1071]: 06:11 AM
              - generic "Read" [ref=e1072]
          - generic [ref=e1077]:
            - generic [ref=e1078]: Bob Vance
            - generic [ref=e1080]: Read receipt sync 1790489517823
            - button "Reply in thread" [ref=e1083]
            - generic [ref=e1087]:
              - generic [ref=e1088]: "128"
              - generic [ref=e1093]: 06:12 AM
          - generic [ref=e1095]:
            - generic [ref=e1096]: Msg 5 1790489556327
            - button "Reply in thread" [ref=e1099]
            - generic [ref=e1103]:
              - generic [ref=e1104]: "128"
              - generic [ref=e1109]: 06:12 AM
              - generic "Read" [ref=e1110]
          - generic [ref=e1115]:
            - generic [ref=e1116]: Msg 4 1790489556327
            - button "Reply in thread" [ref=e1119]
            - generic [ref=e1123]:
              - generic [ref=e1124]: "128"
              - generic [ref=e1129]: 06:12 AM
              - generic "Read" [ref=e1130]
          - generic [ref=e1135]:
            - generic [ref=e1136]: Msg 3 1790489556327
            - button "Reply in thread" [ref=e1139]
            - generic [ref=e1143]:
              - generic [ref=e1144]: "128"
              - generic [ref=e1149]: 06:12 AM
              - generic "Read" [ref=e1150]
          - generic [ref=e1155]:
            - generic [ref=e1156]: Msg 2 1790489556327
            - button "Reply in thread" [ref=e1159]
            - generic [ref=e1163]:
              - generic [ref=e1164]: "128"
              - generic [ref=e1169]: 06:12 AM
              - generic "Read" [ref=e1170]
          - generic [ref=e1175]:
            - generic [ref=e1176]: Msg 1 1790489556327
            - button "Reply in thread" [ref=e1179]
            - generic [ref=e1183]:
              - generic [ref=e1184]: "128"
              - generic [ref=e1189]: 06:12 AM
              - generic "Read" [ref=e1190]
          - generic [ref=e1195]:
            - generic [ref=e1196]: Alice->Bob concurrent 1790489581131
            - button "Reply in thread" [ref=e1199]
            - generic [ref=e1203]:
              - generic [ref=e1204]: "128"
              - generic [ref=e1209]: 06:13 AM
              - generic "Delivered" [ref=e1210]
          - generic [ref=e1215]:
            - generic [ref=e1216]: Round 0 msg 0 1790489600819
            - button "Reply in thread" [ref=e1219]
            - generic [ref=e1223]:
              - generic [ref=e1224]:
                - generic [ref=e1225]: 📡
                - generic [ref=e1226]: 1 hop
              - generic [ref=e1227]: 06:13 AM
              - generic "Sent" [ref=e1228]
      - generic [ref=e1232]:
        - generic [ref=e1233]: "AI Replies:"
        - button "Summarize" [ref=e1238]
      - generic [ref=e1245]:
        - button "Emojis" [ref=e1246]
        - button "Attach file, image, or AI copilot" [ref=e1250]
        - textbox "Write a message... (type @ai to query bot)" [active] [ref=e1254]
        - button "Record Voice Note" [ref=e1255]
```

# Test source

```ts
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
> 150 |     await this.page.locator(`${SELECTORS.messageBubble}:has-text("${text}")`).first().waitFor({
      |                                                                                       ^ TimeoutError: locator.waitFor: Timeout 20000ms exceeded.
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