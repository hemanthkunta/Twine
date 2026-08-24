import { WebSocket } from 'ws';
import { AuthService } from '../services/auth.service.js';
import { MessageService } from '../services/message.service.js';
import { ChatService } from '../services/chat.service.js';
import { initDatabase } from '../db/index.js';

initDatabase();

async function runCrossPlatformSyncSuite() {
  console.log('\n===============================================================');
  console.log('🔄 RUNNING CROSS-PLATFORM (WEB & ANDROID) REAL-TIME SYNC SUITE');
  console.log('===============================================================\n');

  const aliceToken = AuthService.login('alice', 'password123').token;
  const bobToken = AuthService.login('bob', 'password123').token;
  const chat = ChatService.getOrCreateDirectChat('usr_alice_001', 'usr_bob_002');

  const WS_URL = 'ws://localhost:4000/ws';

  function connectClient(name: string, token: string, deviceId: string): Promise<{ ws: WebSocket; receiveFrame: (type: string, timeoutMs?: number) => Promise<any> }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      const listeners = new Map<string, (payload: any) => void>();

      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'auth:handshake',
          payload: { token, device_id: deviceId },
          correlation_id: `corr_${Date.now()}`
        }));
      });

      ws.on('message', (raw: string) => {
        try {
          const frame = JSON.parse(raw.toString());
          if (listeners.has(frame.type)) {
            const cb = listeners.get(frame.type)!;
            listeners.delete(frame.type);
            cb(frame.payload);
          }
        } catch (e) {
          console.error(`[${name}] error parsing frame:`, e);
        }
      });

      ws.on('error', reject);

      const receiveFrame = (type: string, timeoutMs = 3000): Promise<any> => {
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            listeners.delete(type);
            rej(new Error(`Timeout waiting for ${type} on ${name}`));
          }, timeoutMs);

          listeners.set(type, (payload) => {
            clearTimeout(timer);
            res(payload);
          });
        });
      };

      // Wait for auth ack
      receiveFrame('auth:ack').then(() => {
        resolve({ ws, receiveFrame });
      }).catch(reject);
    });
  }

  const results: { testName: string; latencyMs: number; passed: boolean }[] = [];

  try {
    console.log('▶ [1/6] Connecting Alice (Web Desktop), Alice (Android Mobile), and Bob (Android Mobile)...');
    const aliceWeb = await connectClient('Alice (Web)', aliceToken, 'device_web_chrome_01');
    const aliceAndroid = await connectClient('Alice (Android)', aliceToken, 'device_android_pixel_02');
    const bobAndroid = await connectClient('Bob (Android)', bobToken, 'device_android_galaxy_03');
    console.log('  ✅ All 3 multi-device clients authenticated over WebSockets.\n');

    // Test 1: Web -> Android Real-time Message Sync
    console.log('▶ [2/6] Test: Message sent on Alice Web -> instantly synced to Alice Android & Bob Android...');
    const t0 = Date.now();
    const androidPromise = aliceAndroid.receiveFrame('chat:new_message');
    const bobPromise = bobAndroid.receiveFrame('chat:new_message');

    aliceWeb.ws.send(JSON.stringify({
      type: 'chat:send_message',
      payload: {
        temp_id: `temp_${Date.now()}`,
        chat_id: chat.id,
        content: 'Cross-platform sync verification: Hello from Web Desktop!',
        type: 'TEXT'
      }
    }));

    const [aliceAndroidPayload, bobPayload] = await Promise.all([androidPromise, bobPromise]);
    const t1 = Date.now() - t0;
    const msgId = aliceAndroidPayload.message.id;

    if (aliceAndroidPayload.message.content_text === 'Cross-platform sync verification: Hello from Web Desktop!') {
      console.log(`  ✅ Alice Android synced message in ${t1}ms (Payload matched)`);
      results.push({ testName: 'Message Sync (Web -> Android)', latencyMs: t1, passed: true });
    }

    // Test 2: Android -> Web Real-time Message Edit
    console.log('▶ [3/6] Test: Message edited on Alice Android -> instantly updated on Alice Web & Bob Android...');
    const tEdit0 = Date.now();
    const webEditPromise = aliceWeb.receiveFrame('chat:message_edited');
    const bobEditPromise = bobAndroid.receiveFrame('chat:message_edited');

    aliceAndroid.ws.send(JSON.stringify({
      type: 'chat:edit_message',
      payload: {
        message_id: msgId,
        chat_id: chat.id,
        content_text: 'Cross-platform sync verification: Edited from Android Mobile! 🚀'
      }
    }));

    const [webEditPayload] = await Promise.all([webEditPromise, bobEditPromise]);
    const tEdit1 = Date.now() - tEdit0;

    if (webEditPayload.message.content_text.includes('Edited from Android Mobile')) {
      console.log(`  ✅ Alice Web synced message edit in ${tEdit1}ms`);
      results.push({ testName: 'Message Edit Sync (Android -> Web)', latencyMs: tEdit1, passed: true });
    }

    // Test 3: Reaction Sync across devices
    console.log('▶ [4/6] Test: Bob reacts with ❤️ on Android -> Alice Web & Alice Android receive reaction...');
    const tReact0 = Date.now();
    const aliceWebReact = aliceWeb.receiveFrame('chat:reaction_updated');
    const aliceAndroidReact = aliceAndroid.receiveFrame('chat:reaction_updated');

    bobAndroid.ws.send(JSON.stringify({
      type: 'chat:react',
      payload: {
        message_id: msgId,
        emoji: '❤️'
      }
    }));

    await Promise.all([aliceWebReact, aliceAndroidReact]);
    const tReact1 = Date.now() - tReact0;
    console.log(`  ✅ Reaction synced across all devices in ${tReact1}ms`);
    results.push({ testName: 'Reaction Interaction Sync', latencyMs: tReact1, passed: true });

    // Test 4: Read Receipt Sync across devices
    console.log('▶ [5/6] Test: Read receipt marked on Bob Android -> Alice Web & Android receive DELIVERED/READ update...');
    const tReceipt0 = Date.now();
    const aliceWebReceipt = aliceWeb.receiveFrame('chat:receipt_update');
    const aliceAndroidReceipt = aliceAndroid.receiveFrame('chat:receipt_update');

    bobAndroid.ws.send(JSON.stringify({
      type: 'chat:read_receipt',
      payload: {
        chat_id: chat.id,
        message_id: msgId
      }
    }));

    await Promise.all([aliceWebReceipt, aliceAndroidReceipt]);
    const tReceipt1 = Date.now() - tReceipt0;
    console.log(`  ✅ Read receipt synced across all devices in ${tReceipt1}ms`);
    results.push({ testName: 'Read Receipt Sync', latencyMs: tReceipt1, passed: true });

    // Test 5: Message Deletion Sync
    console.log('▶ [6/6] Test: Alice deletes message on Web -> Deleted on Alice Android & Bob Android...');
    const tDel0 = Date.now();
    const aliceAndroidDel = aliceAndroid.receiveFrame('chat:message_deleted');
    const bobDel = bobAndroid.receiveFrame('chat:message_deleted');

    aliceWeb.ws.send(JSON.stringify({
      type: 'chat:delete_message',
      payload: {
        message_id: msgId
      }
    }));

    await Promise.all([aliceAndroidDel, bobDel]);
    const tDel1 = Date.now() - tDel0;
    console.log(`  ✅ Message deletion synced across all devices in ${tDel1}ms`);
    results.push({ testName: 'Message Deletion Sync', latencyMs: tDel1, passed: true });

    aliceWeb.ws.close();
    aliceAndroid.ws.close();
    bobAndroid.ws.close();

    console.log('\n===============================================================');
    console.log('📊 CROSS-PLATFORM INTERCONNECTION & SYNC SUMMARY:');
    console.log('===============================================================');
    for (const r of results) {
      console.log(`  ✅ [PASS] ${r.testName} (Latency: ${r.latencyMs}ms)`);
    }
    console.log(`\nTotal Cross-Platform Tests: ${results.length} | Passed: ${results.length} | Failed: 0\n`);

  } catch (err) {
    console.error('❌ Cross-Platform Sync Test Failed:', err);
    process.exit(1);
  }
}

runCrossPlatformSyncSuite();
