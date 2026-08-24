import { WebSocket } from 'ws';

const BASE_URL = 'http://localhost:4000/api';
const WS_URL = 'ws://localhost:4000/ws';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runE2ETest() {
  console.log('🧪 Starting Telegram Messaging Platform E2E Integration Test...');

  // 1. Health check
  const healthRes = await fetch(`${BASE_URL}/health`);
  const health = await healthRes.json();
  console.log('1. Health check response:', health);

  // 2. Demo login for Alice & Bob
  console.log('2. Logging in Alice & Bob...');
  const aliceAuthRes = await fetch(`${BASE_URL}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'usr_alice_001' }),
  });
  const aliceAuth = await aliceAuthRes.json();
  console.log('   Alice logged in:', aliceAuth.user.display_name, '(Token received)');

  const bobAuthRes = await fetch(`${BASE_URL}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'usr_bob_002' }),
  });
  const bobAuth = await bobAuthRes.json();
  console.log('   Bob logged in:', bobAuth.user.display_name, '(Token received)');

  // 3. Connect WebSockets for Alice & Bob
  console.log('3. Connecting WebSocket clients...');
  const aliceWs = new WebSocket(WS_URL);
  const bobWs = new WebSocket(WS_URL);

  const aliceEvents: any[] = [];
  const bobEvents: any[] = [];

  await new Promise<void>((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    aliceWs.on('open', check);
    bobWs.on('open', check);
  });

  aliceWs.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    aliceEvents.push(frame);
  });

  bobWs.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    bobEvents.push(frame);
  });

  // 4. Authenticate sockets with auth:handshake
  console.log('4. Performing WS auth handshake...');
  aliceWs.send(
    JSON.stringify({
      type: 'auth:handshake',
      payload: { token: aliceAuth.token, device_id: 'dev_alice_browser_1' },
      timestamp: Date.now(),
    })
  );

  bobWs.send(
    JSON.stringify({
      type: 'auth:handshake',
      payload: { token: bobAuth.token, device_id: 'dev_bob_browser_1' },
      timestamp: Date.now(),
    })
  );

  await sleep(400);
  console.log('   Alice received events:', aliceEvents.map((e) => e.type));
  console.log('   Bob received events:', bobEvents.map((e) => e.type));

  if (!aliceEvents.some((e) => e.type === 'auth:ack')) {
    throw new Error('Alice did not receive auth:ack');
  }
  if (!bobEvents.some((e) => e.type === 'auth:ack')) {
    throw new Error('Bob did not receive auth:ack');
  }

  // 5. Alice opens direct chat with Bob via REST API
  console.log('5. Alice creating direct chat with Bob...');
  const chatRes = await fetch(`${BASE_URL}/chats/direct`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceAuth.token}`,
    },
    body: JSON.stringify({ targetUserId: 'usr_bob_002' }),
  });
  const { chat } = await chatRes.json();
  console.log('   Direct Chat established:', chat.id);

  // 6. Bob types indicator
  console.log('6. Bob sending typing indicator...');
  bobWs.send(
    JSON.stringify({
      type: 'chat:typing',
      payload: { chat_id: chat.id, is_typing: true },
      timestamp: Date.now(),
    })
  );

  await sleep(300);
  const typingEvent = aliceEvents.find((e) => e.type === 'chat:user_typing');
  if (!typingEvent || !typingEvent.payload.is_typing) {
    throw new Error('Alice did not receive Bob typing indicator');
  }
  console.log('   Alice verified Bob is typing:', typingEvent.payload.display_name);

  // 7. Alice sends a message
  console.log('7. Alice sending message via WebSocket...');
  const tempMsgId = `temp_${Date.now()}`;
  aliceWs.send(
    JSON.stringify({
      type: 'chat:send_message',
      payload: {
        temp_id: tempMsgId,
        chat_id: chat.id,
        content: 'Hello Bob! Real-time Telegram architecture test 🚀',
        type: 'TEXT',
      },
      timestamp: Date.now(),
    })
  );

  await sleep(500);

  // 8. Alice verifies chat:message_ack
  const ackEvent = aliceEvents.find((e) => e.type === 'chat:message_ack');
  if (!ackEvent || ackEvent.payload.temp_id !== tempMsgId) {
    throw new Error('Alice did not receive chat:message_ack');
  }
  const realMessageId = ackEvent.payload.message_id;
  console.log('   Alice received message ACK:', realMessageId);

  // 9. Bob verifies receiving chat:new_message
  const newMsgEvent = bobEvents.find((e) => e.type === 'chat:new_message');
  if (!newMsgEvent || newMsgEvent.payload.message.id !== realMessageId) {
    throw new Error('Bob did not receive new_message event');
  }
  console.log('   Bob received message payload:', newMsgEvent.payload.message.content_text);

  // 10. Bob sends read receipt
  console.log('10. Bob sending read receipt...');
  bobWs.send(
    JSON.stringify({
      type: 'chat:read_receipt',
      payload: { chat_id: chat.id, message_id: realMessageId },
      timestamp: Date.now(),
    })
  );

  await sleep(400);

  // 11. Alice verifies receipt update
  const readReceiptEvent = aliceEvents.find(
    (e) => e.type === 'chat:receipt_update' && e.payload.status === 'READ'
  );
  if (!readReceiptEvent) {
    throw new Error('Alice did not receive chat:receipt_update READ status');
  }
  console.log('   Alice verified message was READ by Bob:', readReceiptEvent.payload);

  // Cleanup
  aliceWs.close();
  bobWs.close();
  console.log('\n🎉 ALL E2E PROTOCOL AND REAL-TIME TESTS PASSED SUCCESSFULLY!\n');
}

runE2ETest().catch((err) => {
  console.error('❌ E2E Test Failed:', err);
  process.exit(1);
});
