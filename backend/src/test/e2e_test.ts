import { WebSocket } from 'ws';
import { db, initDatabase } from '../db/index.js';
import { MessageService } from '../services/message.service.js';
import { PushNotificationService } from '../services/push.service.js';

const BASE_URL = 'http://localhost:4000/api';
const WS_URL = 'ws://localhost:4000/ws';

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerUser(phoneNumber: string, username: string, displayName: string) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phoneNumber,
            username,
            displayName,
            password: 'TestPassword123!',
        }),
    });

    if (!res.ok) {
        throw new Error(`Registration failed for ${username}: ${res.status} ${await res.text()}`);
    }

    return res.json();
}

function connectWebSocket(
    token: string,
    deviceId: string
): Promise<{
    ws: WebSocket;
    events: any[];
}> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        const events: any[] = [];

        ws.on('message', (data) => {
            try {
                events.push(JSON.parse(data.toString()));
            } catch {
                // Ignore malformed test frames.
            }
        });

        ws.on('error', reject);

        ws.on('open', () => {
            ws.send(
                JSON.stringify({
                    type: 'auth:handshake',
                    payload: {
                        token,
                        device_id: deviceId,
                    },
                    timestamp: Date.now(),
                })
            );

            setTimeout(() => {
                const ack = events.find((event) => event.type === 'auth:ack');

                if (!ack) {
                    reject(new Error(`WebSocket authentication failed for ${deviceId}`));
                    return;
                }

                resolve({ ws, events });
            }, 300);
        });
    });
}

initDatabase();

async function runE2ETest() {
    console.log('Starting WebSocket authorization E2E test...');

    // ------------------------------------------------------------
    // 1. Health check
    // ------------------------------------------------------------

    const healthRes = await fetch(`${BASE_URL}/health`);

    if (!healthRes.ok) {
        throw new Error(`Health check failed: ${healthRes.status}`);
    }

    console.log('1. Health check: PASS');

    // ------------------------------------------------------------
    // 2. Create three isolated test users
    // ------------------------------------------------------------

    const suffix = Date.now();

    const alice = await registerUser(
        `9${suffix.toString().slice(-9)}`,
        `ws_alice_${suffix}`,
        'WS Alice'
    );

    const bob = await registerUser(`8${suffix.toString().slice(-9)}`, `ws_bob_${suffix}`, 'WS Bob');

    const charlie = await registerUser(
        `7${suffix.toString().slice(-9)}`,
        `ws_charlie_${suffix}`,
        'WS Charlie'
    );

    console.log('2. Test users created: PASS');

    // ------------------------------------------------------------
    // 3. Alice creates Alice <-> Charlie chat
    // ------------------------------------------------------------

    const aliceHeaders = {
        Authorization: `Bearer ${alice.token}`,
    };

    const bobHeaders = {
        Authorization: `Bearer ${bob.token}`,
    };

    const chatRes = await fetch(`${BASE_URL}/chats/direct`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...aliceHeaders,
        },
        body: JSON.stringify({
            targetUserId: charlie.user.id,
        }),
    });

    if (!chatRes.ok) {
        throw new Error(`Chat creation failed: ${chatRes.status} ${await chatRes.text()}`);
    }

    const { chat } = await chatRes.json();

    console.log(`3. Alice <-> Charlie chat created: ${chat.id}`);

    // ------------------------------------------------------------
    // 3A. REST DIRECT CHAT ISOLATION
    //
    // Bob must not receive or reuse Alice <-> Charlie's private chat.
    // Bob creating a direct chat with Alice should produce a chat
    // containing Bob + Alice, not Alice + Charlie.
    // ------------------------------------------------------------

    console.log('3A. Testing direct-chat isolation...');

    const bobAliceChatRes = await fetch(`${BASE_URL}/chats/direct`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...bobHeaders,
        },
        body: JSON.stringify({
            targetUserId: alice.user.id,
        }),
    });

    if (!bobAliceChatRes.ok) {
        throw new Error(
            `Direct chat creation failed for Bob: ${bobAliceChatRes.status} ${await bobAliceChatRes.text()}`
        );
    }

    const { chat: bobAliceChat } = await bobAliceChatRes.json();

    if (!bobAliceChat || bobAliceChat.id === chat.id) {
        throw new Error('SECURITY FAILURE: Bob received Alice <-> Charlie private chat');
    }

    console.log('   Bob received a separate Alice <-> Bob chat: PASS');

    // Verify Bob's chat members are isolated from Alice <-> Charlie.
    const bobMembersRes = await fetch(`${BASE_URL}/chats/${bobAliceChat.id}/members`, {
        headers: bobHeaders,
    });

    if (!bobMembersRes.ok) {
        throw new Error(`Could not retrieve Bob <-> Alice members: ${bobMembersRes.status}`);
    }

    const bobMembersData = await bobMembersRes.json();
    const bobMemberIds = bobMembersData.members.map((member: any) => member.user_id);

    if (
        !bobMemberIds.includes(bob.user.id) ||
        !bobMemberIds.includes(alice.user.id) ||
        bobMemberIds.includes(charlie.user.id)
    ) {
        throw new Error('SECURITY FAILURE: Direct chat member isolation is incorrect');
    }

    console.log('   Direct chat member isolation: PASS');

    // ------------------------------------------------------------
    // 4. Connect Alice and Bob
    // ------------------------------------------------------------

    const aliceConnection = await connectWebSocket(alice.token, `e2e_alice_${suffix}`);

    const bobConnection = await connectWebSocket(bob.token, `e2e_bob_${suffix}`);

    const charlieConnection = await connectWebSocket(charlie.token, `e2e_charlie_${suffix}`);

    const aliceWs = aliceConnection.ws;
    const bobWs = bobConnection.ws;
    const charlieWs = charlieConnection.ws;

    const aliceEvents = aliceConnection.events;
    const bobEvents = bobConnection.events;
    const charlieEvents = charlieConnection.events;

    console.log('4. WebSocket authentication: PASS');

    // ------------------------------------------------------------
    // 5. NEGATIVE TEST
    //
    // Bob is NOT a member of Alice <-> Charlie chat.
    // Bob attempts to send a message anyway.
    // ------------------------------------------------------------

    console.log('5. Testing unauthorized WebSocket message send...');

    const unauthorizedTempId = `unauthorized_${Date.now()}`;

    bobWs.send(
        JSON.stringify({
            type: 'chat:send_message',
            payload: {
                temp_id: unauthorizedTempId,
                chat_id: chat.id,
                content: 'This message must NOT be accepted.',
                type: 'TEXT',
            },
            timestamp: Date.now(),
        })
    );

    await sleep(500);

    const forbiddenEvent = bobEvents.find(
        (event) =>
            event.type === 'error' &&
            (event.payload?.code === 'FORBIDDEN' ||
                event.payload?.message === 'You are not a member of this chat')
    );

    const unauthorizedAck = bobEvents.find(
        (event) =>
            event.type === 'chat:message_ack' && event.payload?.temp_id === unauthorizedTempId
    );

    if (unauthorizedAck) {
        throw new Error('SECURITY FAILURE: Non-member was able to send a message');
    }

    if (!forbiddenEvent) {
        throw new Error('SECURITY FAILURE: Expected FORBIDDEN response was not received');
    }

    console.log('   Unauthorized message correctly rejected: PASS');

    // ------------------------------------------------------------
    // 6. POSITIVE TEST
    //
    // Alice IS a member of Alice <-> Charlie chat.
    // Alice should be able to send.
    // ------------------------------------------------------------

    console.log('6. Testing authorized WebSocket message send...');

    const authorizedTempId = `authorized_${Date.now()}`;

    aliceWs.send(
        JSON.stringify({
            type: 'chat:send_message',
            payload: {
                temp_id: authorizedTempId,
                chat_id: chat.id,
                content: 'Authorized WebSocket message.',
                type: 'TEXT',
            },
            timestamp: Date.now(),
        })
    );

    await sleep(500);

    const authorizedAck = aliceEvents.find(
        (event) => event.type === 'chat:message_ack' && event.payload?.temp_id === authorizedTempId
    );

    if (!authorizedAck) {
        throw new Error('Authorized member could not send a message');
    }

    console.log('   Authorized message accepted: PASS');

    // ------------------------------------------------------------
    // EDIT AUTHORIZATION TEST
    // ------------------------------------------------------------

    console.log('6A. Testing message edit authorization...');

    // Clear previous events so this test only examines new events.
    aliceEvents.length = 0;
    bobEvents.length = 0;
    charlieEvents.length = 0;

    const editableMessageId = authorizedAck.payload.message_id;

    // ------------------------------------------------------------
    // 1. Alice owns the message.
    // Alice should be able to edit her own message.
    // ------------------------------------------------------------

    console.log('   Testing message owner edit...');

    aliceWs.send(
        JSON.stringify({
            type: 'chat:edit_message',
            payload: {
                message_id: editableMessageId,
                chat_id: chat.id,
                content_text: 'Edited authorized WebSocket message.',
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const aliceEditEvent = aliceEvents.find(
        (event) =>
            event.type === 'chat:message_edited' && event.payload?.message?.id === editableMessageId
    );

    if (!aliceEditEvent) {
        throw new Error('SECURITY/REGRESSION FAILURE: Message owner could not edit own message');
    }

    if (aliceEditEvent.payload.message.content_text !== 'Edited authorized WebSocket message.') {
        throw new Error('SECURITY/REGRESSION FAILURE: Edited message content was not updated');
    }

    console.log('   Message owner edit: PASS');

    // ------------------------------------------------------------
    // 2. Charlie is a member but does NOT own Alice's message.
    // Charlie must NOT be able to edit it.
    // ------------------------------------------------------------

    console.log('   Testing member-but-not-owner edit...');

    charlieEvents.length = 0;

    charlieWs.send(
        JSON.stringify({
            type: 'chat:edit_message',
            payload: {
                message_id: editableMessageId,
                chat_id: chat.id,
                content_text: 'Charlie maliciously edited Alice message.',
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const charlieEditError = charlieEvents.find(
        (event) => event.type === 'error' && event.payload?.code === 'FORBIDDEN'
    );

    if (!charlieEditError) {
        throw new Error("SECURITY FAILURE: Chat member was able to edit another user's message");
    }

    console.log('   Member-but-not-owner edit correctly rejected: PASS');

    // ------------------------------------------------------------
    // 3. Bob is NOT a member of Alice <-> Charlie chat.
    // Bob must NOT be able to edit Alice's message.
    // ------------------------------------------------------------

    console.log('   Testing non-member edit...');

    bobEvents.length = 0;

    bobWs.send(
        JSON.stringify({
            type: 'chat:edit_message',
            payload: {
                message_id: editableMessageId,
                chat_id: chat.id,
                content_text: 'Bob maliciously edited Alice message.',
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const bobEditError = bobEvents.find(
        (event) => event.type === 'error' && event.payload?.code === 'FORBIDDEN'
    );

    if (!bobEditError) {
        throw new Error('SECURITY FAILURE: Non-member was able to edit another user message');
    }

    console.log('   Non-member edit correctly rejected: PASS');

    // ------------------------------------------------------------
    // 4. Verify the original edited message still contains
    // Alice's legitimate edit and was not overwritten.
    // ------------------------------------------------------------

    const editedMessage = aliceEditEvent.payload?.message;

    if (!editedMessage) {
        throw new Error('SECURITY/REGRESSION FAILURE: Edited message payload missing');
    }

    if (editedMessage.content_text !== 'Edited authorized WebSocket message.') {
        throw new Error('SECURITY FAILURE: Unauthorized edit changed message content');
    }

    console.log('   Unauthorized edit integrity check: PASS');

    // ------------------------------------------------------------
    // DELETE AUTHORIZATION TEST
    // ------------------------------------------------------------

    console.log('6B. Testing message deletion authorization...');

    bobEvents.length = 0;
    aliceEvents.length = 0;

    // Alice owns the authorized message.
    // Alice should be able to delete it.
    aliceWs.send(
        JSON.stringify({
            type: 'chat:delete_message',
            payload: {
                message_id: authorizedAck.payload.message_id,
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const aliceDeleteEvent = aliceEvents.find(
        (event) =>
            event.type === 'chat:message_deleted' &&
            event.payload?.message_id === authorizedAck.payload.message_id
    );

    if (!aliceDeleteEvent) {
        throw new Error('SECURITY/REGRESSION FAILURE: Message owner could not delete own message');
    }

    console.log('   Message owner deletion: PASS');

    // Alice creates another message specifically for the
    // unauthorized deletion test.
    const deleteTestTempId = `delete_test_${Date.now()}`;

    aliceWs.send(
        JSON.stringify({
            type: 'chat:send_message',
            payload: {
                temp_id: deleteTestTempId,
                chat_id: chat.id,
                content: 'Message used for deletion authorization test.',
                type: 'TEXT',
            },
            timestamp: Date.now(),
        })
    );

    await sleep(500);

    const deleteTestAck = aliceEvents.find(
        (event) => event.type === 'chat:message_ack' && event.payload?.temp_id === deleteTestTempId
    );

    if (!deleteTestAck) {
        throw new Error('Could not create deletion authorization test message');
    }

    const protectedMessageId = deleteTestAck.payload.message_id;

    console.log(`   Protected test message created: ${protectedMessageId}`);

    // ------------------------------------------------------------
    // Charlie IS a member of the chat, but does NOT own Alice's
    // message. Charlie must NOT be able to delete it.
    // ------------------------------------------------------------

    charlieEvents.length = 0;

    console.log('   Testing member-but-not-owner deletion...');

    charlieWs.send(
        JSON.stringify({
            type: 'chat:delete_message',
            payload: {
                message_id: protectedMessageId,
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const charlieDeleteError = charlieEvents.find(
        (event) => event.type === 'error' && event.payload?.code === 'FORBIDDEN'
    );

    if (!charlieDeleteError) {
        throw new Error("SECURITY FAILURE: Chat member was able to delete another user's message");
    }

    console.log('   Member-but-not-owner deletion correctly rejected: PASS');

    // Bob is NOT a member of Alice <-> Charlie chat.
    // Bob attempts to delete Alice's message.
    bobWs.send(
        JSON.stringify({
            type: 'chat:delete_message',
            payload: {
                message_id: protectedMessageId,
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const bobDeleteError = bobEvents.find(
        (event) => event.type === 'error' && event.payload?.code === 'FORBIDDEN'
    );

    if (!bobDeleteError) {
        throw new Error('SECURITY FAILURE: Non-member deletion was not rejected');
    }

    console.log('   Non-member deletion correctly rejected: PASS');

    // ------------------------------------------------------------
    // Create a fresh message for the read-receipt test.
    // The previous authorized message was deleted.
    // ------------------------------------------------------------

    const readTestTempId = `read_test_${Date.now()}`;

    aliceWs.send(
        JSON.stringify({
            type: 'chat:send_message',
            payload: {
                temp_id: readTestTempId,
                chat_id: chat.id,
                content: 'Message used for read receipt authorization test.',
                type: 'TEXT',
            },
            timestamp: Date.now(),
        })
    );

    await sleep(500);

    const readTestAck = aliceEvents.find(
        (event) => event.type === 'chat:message_ack' && event.payload?.temp_id === readTestTempId
    );

    if (!readTestAck) {
        throw new Error('Could not create read receipt authorization test message');
    }

    const readTestMessageId = readTestAck.payload.message_id;

    console.log(`   Read receipt test message created: ${readTestMessageId}`);

    // ------------------------------------------------------------
    // 7. NEGATIVE TEST — typing
    //
    // Bob is not a member, so typing must be rejected.
    // ------------------------------------------------------------

    console.log('7. Testing unauthorized typing indicator...');

    bobWs.send(
        JSON.stringify({
            type: 'chat:typing',
            payload: {
                chat_id: chat.id,
                is_typing: true,
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const unauthorizedTyping = aliceEvents.find(
        (event) => event.type === 'chat:user_typing' && event.payload?.user_id === bob.user.id
    );

    if (unauthorizedTyping) {
        throw new Error('SECURITY FAILURE: Non-member typing indicator was broadcast');
    }

    console.log('   Unauthorized typing correctly rejected: PASS');

    // ------------------------------------------------------------
    // 8. NEGATIVE TEST — read receipt
    // ------------------------------------------------------------

    console.log('8. Testing unauthorized read receipt...');

    const realMessageId = readTestMessageId;

    bobWs.send(
        JSON.stringify({
            type: 'chat:read_receipt',
            payload: {
                chat_id: chat.id,
                message_id: realMessageId,
            },
            timestamp: Date.now(),
        })
    );

    await sleep(400);

    const unauthorizedReceipt = aliceEvents.find(
        (event) =>
            event.type === 'chat:receipt_update' &&
            event.payload?.user_id === bob.user.id &&
            event.payload?.message_id === realMessageId
    );

    if (unauthorizedReceipt) {
        throw new Error('SECURITY FAILURE: Non-member read receipt was accepted');
    }

    console.log('   Unauthorized read receipt correctly rejected: PASS');

    // ------------------------------------------------------------
    // 9. POSITIVE TEST — authorized read receipt
    //
    // Charlie is a member of the Alice <-> Charlie chat.
    // Alice's message should be marked READ when Charlie reads it.
    // Alice must receive the READ receipt event.
    // ------------------------------------------------------------

    console.log('9. Testing authorized read receipt...');

    aliceEvents.length = 0;
    charlieEvents.length = 0;

    charlieWs.send(
        JSON.stringify({
            type: 'chat:read_receipt',
            payload: {
                chat_id: chat.id,
                message_id: readTestMessageId,
            },
            timestamp: Date.now(),
        })
    );

    await sleep(500);

    const readReceiptEvent = aliceEvents.find(
        (event) =>
            event.type === 'chat:receipt_update' &&
            event.payload?.message_id === readTestMessageId &&
            event.payload?.user_id === charlie.user.id &&
            event.payload?.status === 'READ'
    );

    if (!readReceiptEvent) {
        throw new Error(
            'SECURITY/REGRESSION FAILURE: Authorized READ receipt was not delivered to message owner'
        );
    }

    console.log('   Authorized READ receipt delivered: PASS');

    // Verify the READ state was persisted in SQLite.
    const storedReceipt = db
        .prepare(
            `
            SELECT status
            FROM message_receipts
            WHERE message_id = ? AND user_id = ?
            `
        )
        .get(readTestMessageId, charlie.user.id) as { status: string } | undefined;

    if (!storedReceipt) {
        throw new Error('SECURITY/REGRESSION FAILURE: READ receipt was not persisted');
    }

    if (storedReceipt.status !== 'READ') {
        throw new Error(
            `SECURITY/REGRESSION FAILURE: Expected READ receipt, got ${storedReceipt.status}`
        );
    }

    console.log('   READ receipt persisted in database: PASS');

    // ------------------------------------------------------------
    // 10. AUTHENTICATION / SESSION LIFECYCLE TESTS
    // ------------------------------------------------------------

    console.log('10. Testing authentication/session lifecycle...');

    const sessionTestUser = await registerUser(
        `999${Date.now().toString().slice(-7)}`,
        `session_test_${Date.now()}`,
        'Session Lifecycle Test'
    );

    let lifecycleAccessToken = sessionTestUser.token;
    let lifecycleRefreshToken = sessionTestUser.refreshToken;
    const lifecycleSessionId = sessionTestUser.sessionId;

    // 10.1 Initial access token must work.
    const initialMeResponse = await fetch(`${BASE_URL}/auth/me`, {
        headers: {
            Authorization: `Bearer ${lifecycleAccessToken}`,
        },
    });

    if (!initialMeResponse.ok) {
        throw new Error(
            `SECURITY FAILURE: Newly issued access token was rejected (${initialMeResponse.status})`
        );
    }

    console.log('   Initial access token accepted: PASS');

    // 10.2 Refresh token must issue a new access token.
    const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            refreshToken: lifecycleRefreshToken,
        }),
    });

    if (!refreshResponse.ok) {
        throw new Error(
            `SECURITY FAILURE: Valid refresh token was rejected (${refreshResponse.status})`
        );
    }

    const firstRefresh = await refreshResponse.json();

    if (
        typeof firstRefresh.token !== 'string' ||
        typeof firstRefresh.refreshToken !== 'string' ||
        firstRefresh.sessionId !== lifecycleSessionId
    ) {
        throw new Error(
            'SECURITY FAILURE: Refresh response did not contain valid rotated credentials'
        );
    }

    const oldRefreshToken = lifecycleRefreshToken;

    lifecycleAccessToken = firstRefresh.token;
    lifecycleRefreshToken = firstRefresh.refreshToken;

    console.log('   Refresh token accepted and rotated: PASS');

    // 10.3 The old refresh token must no longer work.
    const oldRefreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            refreshToken: oldRefreshToken,
        }),
    });

    if (oldRefreshResponse.status !== 401) {
        throw new Error(
            `SECURITY FAILURE: Rotated refresh token was reusable (HTTP ${oldRefreshResponse.status})`
        );
    }

    console.log('   Old refresh token reuse rejected: PASS');

    // 10.4 The newly rotated refresh token must work.
    const secondRefreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            refreshToken: lifecycleRefreshToken,
        }),
    });

    if (!secondRefreshResponse.ok) {
        throw new Error(
            `SECURITY FAILURE: Newly rotated refresh token was rejected (${secondRefreshResponse.status})`
        );
    }

    const secondRefresh = await secondRefreshResponse.json();

    if (
        typeof secondRefresh.token !== 'string' ||
        typeof secondRefresh.refreshToken !== 'string' ||
        secondRefresh.sessionId !== lifecycleSessionId
    ) {
        throw new Error('SECURITY FAILURE: Second refresh response contained invalid credentials');
    }

    lifecycleAccessToken = secondRefresh.token;
    lifecycleRefreshToken = secondRefresh.refreshToken;

    console.log('   New refresh token accepted: PASS');

    // 10.5 Verify the newest access token works.
    const refreshedMeResponse = await fetch(`${BASE_URL}/auth/me`, {
        headers: {
            Authorization: `Bearer ${lifecycleAccessToken}`,
        },
    });

    if (!refreshedMeResponse.ok) {
        throw new Error(
            `SECURITY FAILURE: Access token obtained from refresh was rejected (${refreshedMeResponse.status})`
        );
    }

    console.log('   Refreshed access token accepted: PASS');

    // 10.6 Revoke the session.
    const revokeResponse = await fetch(`${BASE_URL}/users/sessions/${lifecycleSessionId}/revoke`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${lifecycleAccessToken}`,
        },
    });

    if (!revokeResponse.ok) {
        throw new Error(
            `SECURITY FAILURE: Session could not be revoked (${revokeResponse.status})`
        );
    }

    const revokeData = await revokeResponse.json();

    if (revokeData.success !== true) {
        throw new Error('SECURITY FAILURE: Session revoke endpoint did not report success');
    }

    console.log('   Session revocation: PASS');

    // 10.7 A previously valid access token must now be rejected.
    const revokedAccessResponse = await fetch(`${BASE_URL}/auth/me`, {
        headers: {
            Authorization: `Bearer ${lifecycleAccessToken}`,
        },
    });

    if (revokedAccessResponse.status !== 401) {
        throw new Error(
            `SECURITY FAILURE: Revoked session access token remained valid (HTTP ${revokedAccessResponse.status})`
        );
    }

    console.log('   Revoked access token rejected: PASS');

    // 10.8 The latest refresh token must also be rejected.
    const revokedRefreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            refreshToken: lifecycleRefreshToken,
        }),
    });

    if (revokedRefreshResponse.status !== 401) {
        throw new Error(
            `SECURITY FAILURE: Revoked session refresh token remained valid (HTTP ${revokedRefreshResponse.status})`
        );
    }

    console.log('   Revoked refresh token rejected: PASS');

    console.log('   Authentication/session lifecycle tests: PASS');

    // ------------------------------------------------------------
    // 11. REST AI ENDPOINT AUTHORIZATION / IDOR TESTS
    // ------------------------------------------------------------

    console.log('11. Testing REST AI endpoint authorization...');

    // Bob is NOT a member of Alice <-> Charlie chat.
    // He must not be able to access the chat through AI endpoints.

    // 11A. AI summarize — non-member
    const summarizeRes = await fetch(`${BASE_URL}/ai/summarize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...bobHeaders,
        },
        body: JSON.stringify({
            chatId: chat.id,
        }),
    });

    if (summarizeRes.status !== 403) {
        throw new Error(
            `SECURITY FAILURE: Non-member accessed /ai/summarize. Expected 403, got ${summarizeRes.status}`
        );
    }

    console.log('   Non-member AI summarize rejected: PASS');

    // 11B. AI smart replies — non-member
    const smartRepliesRes = await fetch(`${BASE_URL}/ai/smart-replies/${chat.id}`, {
        method: 'GET',
        headers: bobHeaders,
    });

    if (smartRepliesRes.status !== 403) {
        throw new Error(
            `SECURITY FAILURE: Non-member accessed /ai/smart-replies. Expected 403, got ${smartRepliesRes.status}`
        );
    }

    console.log('   Non-member AI smart-replies rejected: PASS');

    // 11C. Alice IS a member.
    // Verify legitimate access still works.

    const authorizedSummarizeRes = await fetch(`${BASE_URL}/ai/summarize`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...aliceHeaders,
        },
        body: JSON.stringify({
            chatId: chat.id,
        }),
    });

    if (authorizedSummarizeRes.status === 403) {
        throw new Error('REGRESSION FAILURE: Chat member was blocked from /ai/summarize');
    }

    console.log('   Chat member AI summarize access: PASS');

    // 11D. Authorized smart replies
    const authorizedSmartRepliesRes = await fetch(`${BASE_URL}/ai/smart-replies/${chat.id}`, {
        method: 'GET',
        headers: aliceHeaders,
    });

    if (authorizedSmartRepliesRes.status === 403) {
        throw new Error('REGRESSION FAILURE: Chat member was blocked from /ai/smart-replies');
    }

    console.log('   Chat member AI smart-replies access: PASS');

    // 11E. AI semantic search — non-member
    const semanticSearchRes = await fetch(`${BASE_URL}/ai/semantic-search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...bobHeaders,
        },
        body: JSON.stringify({
            query: 'message',
            chatId: chat.id,
        }),
    });

    if (semanticSearchRes.status !== 403) {
        throw new Error(
            `SECURITY FAILURE: Non-member accessed /ai/semantic-search. Expected 403, got ${semanticSearchRes.status}`
        );
    }

    console.log('   Non-member AI semantic-search rejected: PASS');

    // 11F. AI suggest topics — non-member
    const suggestTopicsRes = await fetch(`${BASE_URL}/ai/suggest-topics`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...bobHeaders,
        },
        body: JSON.stringify({
            chatId: chat.id,
            chatTitle: 'Private Chat',
        }),
    });

    if (suggestTopicsRes.status !== 403) {
        throw new Error(
            `SECURITY FAILURE: Non-member accessed /ai/suggest-topics. Expected 403, got ${suggestTopicsRes.status}`
        );
    }

    console.log('   Non-member AI suggest-topics rejected: PASS');

    // ------------------------------------------------------------
    // 12. POLL AUTHORIZATION / IDOR TESTS
    // ------------------------------------------------------------

    console.log('12. Testing poll authorization...');

    // 12A. Alice creates a poll in Alice <-> Charlie chat.
    const createPollRes = await fetch(`${BASE_URL}/polls/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...aliceHeaders,
        },
        body: JSON.stringify({
            chatId: chat.id,
            question: 'E2E security test poll?',
            options: ['Option A', 'Option B'],
            isAnonymous: false,
        }),
    });

    if (!createPollRes.ok) {
        throw new Error(
            `Poll creation failed: ${createPollRes.status} ${await createPollRes.text()}`
        );
    }

    const pollResponse = await createPollRes.json();
    const pollMessage = pollResponse.message;

    if (!pollMessage?.poll?.id) {
        throw new Error('SECURITY/REGRESSION FAILURE: Poll was not created correctly');
    }

    const pollId = pollMessage.poll.id;
    const optionA = pollMessage.poll.options[0]?.id;
    const optionB = pollMessage.poll.options[1]?.id;

    if (!optionA || !optionB) {
        throw new Error('SECURITY/REGRESSION FAILURE: Poll options were not created');
    }

    console.log(`   Poll created: ${pollId}`);

    // 12B. Bob is NOT a member of Alice <-> Charlie.
    // Bob must not be able to vote.
    const unauthorizedVoteRes = await fetch(`${BASE_URL}/polls/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...bobHeaders,
        },
        body: JSON.stringify({
            pollId,
            optionId: optionA,
        }),
    });

    if (unauthorizedVoteRes.status !== 403) {
        throw new Error(
            `SECURITY FAILURE: Non-member voted in private poll. Expected 403, got ${unauthorizedVoteRes.status}`
        );
    }

    console.log('   Non-member poll vote rejected: PASS');

    // 12C. Charlie IS a member and should be able to vote.
    const authorizedVoteRes = await fetch(`${BASE_URL}/polls/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...aliceHeaders,
        },
        body: JSON.stringify({
            pollId,
            optionId: optionA,
        }),
    });

    if (!authorizedVoteRes.ok) {
        throw new Error(
            `REGRESSION FAILURE: Chat member could not vote: ${authorizedVoteRes.status} ${await authorizedVoteRes.text()}`
        );
    }

    const authorizedVoteData = await authorizedVoteRes.json();

    const votedPoll = authorizedVoteData.poll;

    if (!votedPoll || votedPoll.total_votes !== 1) {
        throw new Error(`REGRESSION FAILURE: Authorized poll vote was not recorded correctly`);
    }

    console.log('   Chat member poll vote accepted: PASS');

    // 12D. Verify Alice's vote is actually attached to Option A.
    const votedOption = votedPoll.options.find((option: any) => option.id === optionA);

    if (!votedOption || votedOption.vote_count !== 1) {
        throw new Error(
            'SECURITY/REGRESSION FAILURE: Authorized poll vote was not persisted in poll state'
        );
    }

    console.log('   Poll vote state updated: PASS');

    // 12E. Charlie changes his vote to Option B.
    const charlieVoteRes = await fetch(`${BASE_URL}/polls/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${charlie.token}`,
        },
        body: JSON.stringify({
            pollId,
            optionId: optionB,
        }),
    });

    if (!charlieVoteRes.ok) {
        throw new Error(
            `REGRESSION FAILURE: Charlie could not vote: ${charlieVoteRes.status} ${await charlieVoteRes.text()}`
        );
    }

    const charlieVoteData = await charlieVoteRes.json();

    if (charlieVoteData.poll.total_votes !== 2) {
        throw new Error(
            `REGRESSION FAILURE: Expected 2 total votes, got ${charlieVoteData.poll.total_votes}`
        );
    }

    console.log('   Second member poll vote accepted: PASS');

    // 12F. Alice changes her vote from Option A to Option B.
    const aliceChangeVoteRes = await fetch(`${BASE_URL}/polls/vote`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...aliceHeaders,
        },
        body: JSON.stringify({
            pollId,
            optionId: optionB,
        }),
    });

    if (!aliceChangeVoteRes.ok) {
        throw new Error(
            `REGRESSION FAILURE: Alice could not change her vote: ${aliceChangeVoteRes.status}`
        );
    }

    const changedVoteData = await aliceChangeVoteRes.json();

    if (changedVoteData.poll.total_votes !== 2) {
        throw new Error(
            `REGRESSION FAILURE: Changing vote duplicated the vote count: ${changedVoteData.poll.total_votes}`
        );
    }

    const finalOptionA = changedVoteData.poll.options.find((option: any) => option.id === optionA);

    const finalOptionB = changedVoteData.poll.options.find((option: any) => option.id === optionB);

    if (
        !finalOptionA ||
        !finalOptionB ||
        finalOptionA.vote_count !== 0 ||
        finalOptionB.vote_count !== 2
    ) {
        throw new Error(
            'SECURITY/REGRESSION FAILURE: Poll vote switching produced incorrect state'
        );
    }

    console.log('   Poll vote switching: PASS');

    // ------------------------------------------------------------
    // 13. THREADED REPLY AUTHORIZATION / IDOR TESTS
    // ------------------------------------------------------------

    console.log('13. Testing threaded reply authorization...');

    // Alice creates a parent message in the Alice <-> Charlie chat.
    const threadParent = MessageService.createMessage({
        chatId: chat.id,
        senderId: alice.user.id,
        contentText: 'E2E thread authorization parent message',
    });

    const threadParentId = threadParent.id;

    // Charlie creates a reply to Alice's message.
    const threadReply = MessageService.createMessage({
        chatId: chat.id,
        senderId: charlie.user.id,
        contentText: 'E2E thread authorization reply',
        replyToMessageId: threadParentId,
    });

    if (threadReply.reply_to_message_id !== threadParentId) {
        throw new Error('REGRESSION FAILURE: Thread reply was not linked to parent message');
    }

    console.log('   Thread parent and reply created: PASS');

    // Bob is NOT a member of Alice <-> Charlie.
    // He must not be able to retrieve the private thread.
    const unauthorizedThreadRes = await fetch(`${BASE_URL}/threads/${threadParentId}`, {
        headers: bobHeaders,
    });

    if (unauthorizedThreadRes.status !== 403) {
        throw new Error(
            `SECURITY FAILURE: Non-member accessed private thread. Expected 403, got ${unauthorizedThreadRes.status}`
        );
    }

    console.log('   Non-member thread access rejected: PASS');

    // Alice IS a member and should be able to retrieve the thread.
    const authorizedThreadRes = await fetch(`${BASE_URL}/threads/${threadParentId}`, {
        headers: aliceHeaders,
    });

    if (!authorizedThreadRes.ok) {
        throw new Error(
            `REGRESSION FAILURE: Chat member could not access thread: ${authorizedThreadRes.status}`
        );
    }

    const threadData = await authorizedThreadRes.json();

    if (threadData.parent?.id !== threadParentId) {
        throw new Error('REGRESSION FAILURE: Thread parent message was not returned correctly');
    }

    if (
        !Array.isArray(threadData.messages) ||
        !threadData.messages.some((message: any) => message.id === threadReply.id)
    ) {
        throw new Error('REGRESSION FAILURE: Thread reply was not returned correctly');
    }

    console.log('   Chat member thread access: PASS');

    // ------------------------------------------------------------
    // 14. PUSH SUBSCRIPTION AUTHORIZATION / PERSISTENCE TESTS
    // ------------------------------------------------------------

    console.log('14. Testing push subscription authorization...');

    // Bob attempts to register a subscription while supplying Alice's userId.
    // The server must use the authenticated identity (Bob), not the
    // userId supplied inside the subscription payload.
    const attackerControlledSubscription = {
        userId: alice.user.id,
        endpoint: `https://push.example.test/e2e/${Date.now()}`,
        keys: {
            p256dh: 'e2e-test-p256dh',
            auth: 'e2e-test-auth',
        },
    };

    const pushSubscribeRes = await fetch(`${BASE_URL}/push/subscribe`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...bobHeaders,
        },
        body: JSON.stringify({
            subscription: attackerControlledSubscription,
        }),
    });

    if (!pushSubscribeRes.ok) {
        throw new Error(
            `SECURITY FAILURE: Authenticated user could not register push subscription: ${pushSubscribeRes.status}`
        );
    }

    console.log('   Push subscription registration: PASS');

    const endpoint = attackerControlledSubscription.endpoint;

    // Verify the database record belongs to Bob, never Alice.
    const storedSubscription = db
        .prepare(
            `
            SELECT user_id, endpoint, p256dh, auth
            FROM push_subscriptions
            WHERE endpoint = ?
            LIMIT 1
            `
        )
        .get(endpoint) as
        | {
              user_id: string;
              endpoint: string;
              p256dh: string;
              auth: string;
          }
        | undefined;

    if (!storedSubscription) {
        throw new Error('SECURITY FAILURE: Push subscription was not persisted to the database');
    }

    if (storedSubscription.user_id !== bob.user.id) {
        throw new Error(
            `SECURITY FAILURE: Push subscription was assigned to ${storedSubscription.user_id} instead of authenticated Bob`
        );
    }

    if (storedSubscription.user_id === alice.user.id) {
        throw new Error(
            'SECURITY FAILURE: Attacker-controlled userId caused subscription ownership override'
        );
    }

    if (
        storedSubscription.endpoint !== endpoint ||
        storedSubscription.p256dh !== attackerControlledSubscription.keys.p256dh ||
        storedSubscription.auth !== attackerControlledSubscription.keys.auth
    ) {
        throw new Error(
            'SECURITY FAILURE: Persisted push subscription data does not match the authenticated request'
        );
    }

    console.log('   Push subscription ownership isolation: PASS');
    console.log('   Push subscription persistence: PASS');

    // Verify the service can retrieve Bob's persisted subscription.
    const bobSubscriptions = PushNotificationService.getSubscriptions(bob.user.id);

    if (!bobSubscriptions.some((sub) => sub.endpoint === endpoint)) {
        throw new Error(
            'REGRESSION FAILURE: Persisted Bob push subscription could not be retrieved'
        );
    }

    // Alice must not see Bob's subscription.
    const aliceSubscriptions = PushNotificationService.getSubscriptions(alice.user.id);

    if (aliceSubscriptions.some((sub) => sub.endpoint === endpoint)) {
        throw new Error('SECURITY FAILURE: Alice could retrieve Bob push subscription');
    }

    console.log('   Push subscription user isolation: PASS');

    // Verify sendPush() uses the persisted subscription.
    const pushResult = await PushNotificationService.sendPush(
        bob.user.id,
        'E2E Test',
        'Persistent push test'
    );

    if (!pushResult.sent || pushResult.subscriptionCount !== 1) {
        throw new Error(
            `REGRESSION FAILURE: Persisted push subscription was not used by sendPush(): ${JSON.stringify(pushResult)}`
        );
    }

    console.log('   Persisted subscription used by sendPush: PASS');

    // ------------------------------------------------------------
    // 15. CHANNEL ANALYTICS AUTHORIZATION / IDOR TESTS
    // ------------------------------------------------------------

    console.log('15. Testing channel analytics authorization...');

    // 15A. Bob is NOT a member of Alice <-> Charlie.
    // He must not be able to retrieve private chat analytics.
    const unauthorizedAnalyticsRes = await fetch(`${BASE_URL}/channels/${chat.id}/analytics`, {
        headers: bobHeaders,
    });

    if (unauthorizedAnalyticsRes.status !== 403) {
        throw new Error(
            `SECURITY FAILURE: Non-member accessed private channel analytics. Expected 403, got ${unauthorizedAnalyticsRes.status}`
        );
    }

    console.log('   Non-member channel analytics rejected: PASS');

    // 15B. Alice IS a member and should be able to retrieve analytics.
    const authorizedAnalyticsRes = await fetch(`${BASE_URL}/channels/${chat.id}/analytics`, {
        headers: aliceHeaders,
    });

    if (!authorizedAnalyticsRes.ok) {
        throw new Error(
            `REGRESSION FAILURE: Chat member could not access channel analytics: ${authorizedAnalyticsRes.status} ${await authorizedAnalyticsRes.text()}`
        );
    }

    const analyticsData = await authorizedAnalyticsRes.json();

    if (
        typeof analyticsData !== 'object' ||
        analyticsData === null ||
        !Array.isArray(analyticsData.topPosts) ||
        !Array.isArray(analyticsData.viewsByHour) ||
        typeof analyticsData.totalViews !== 'number'
    ) {
        throw new Error('REGRESSION FAILURE: Channel analytics response has an invalid structure');
    }

    console.log('   Chat member channel analytics access: PASS');
    console.log('   Channel analytics response integrity: PASS');

    // ------------------------------------------------------------
    // 16. FEDERATION STATUS AUTHORIZATION / INFORMATION DISCLOSURE
    // ------------------------------------------------------------

    console.log('16. Testing federation status authorization...');

    // 16A. Unauthenticated users must not access federation status.
    const unauthenticatedFederationRes = await fetch(`${BASE_URL}/federation/status`);

    if (unauthenticatedFederationRes.status !== 401) {
        throw new Error(
            `SECURITY FAILURE: Unauthenticated federation status access was allowed. Expected 401, got ${unauthenticatedFederationRes.status}`
        );
    }

    console.log('   Unauthenticated federation status rejected: PASS');

    // 16B. Authenticated users may access the status endpoint.
    const federationRes = await fetch(`${BASE_URL}/federation/status`, {
        headers: bobHeaders,
    });

    if (!federationRes.ok) {
        throw new Error(
            `REGRESSION FAILURE: Authenticated federation status request failed: ${federationRes.status} ${await federationRes.text()}`
        );
    }

    const federationData = await federationRes.json();

    if (
        typeof federationData !== 'object' ||
        federationData === null ||
        typeof federationData.enabled !== 'boolean' ||
        typeof federationData.federationConnected !== 'boolean' ||
        !Array.isArray(federationData.supportedProtocols)
    ) {
        throw new Error(
            'SECURITY/REGRESSION FAILURE: Federation status response has an invalid structure'
        );
    }

    console.log('   Authenticated federation status access: PASS');
    console.log('   Federation status response integrity: PASS');

    // 16C. Basic secret-disclosure check.
    const federationText = JSON.stringify(federationData).toLowerCase();

    const forbiddenFields = [
        'password',
        'private_key',
        'privatekey',
        'secret',
        'access_token',
        'refresh_token',
    ];

    const leakedField = forbiddenFields.find((field) => federationText.includes(field));

    if (leakedField) {
        throw new Error(
            `SECURITY FAILURE: Federation status appears to disclose sensitive field "${leakedField}"`
        );
    }

    console.log('   Federation status secret-disclosure check: PASS');

    // ------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------

    aliceWs.close();
    bobWs.close();
    charlieWs.close();

    console.log('');
    console.log('==============================================');
    console.log('WEBSOCKET AUTHORIZATION TESTS PASSED');
    console.log('==============================================');
    console.log('');
}

runE2ETest().catch((err) => {
    console.error('');
    console.error('E2E TEST FAILED');
    console.error(err);
    process.exitCode = 1;
});
