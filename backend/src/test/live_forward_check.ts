/**
 * Live end-to-end check of POST /messages/forward + FTS search over HTTP.
 * Requires the backend listening on :4000. Run: npx tsx src/test/live_forward_check.ts
 */
const API = 'http://localhost:4000/api';

async function api(token: string, method: string, path: string, body?: any) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const json: any = await res.json().catch(() => ({}));
    return { status: res.status, json };
}

let passed = 0,
    failed = 0;
function check(name: string, ok: boolean, detail?: string) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
    ok ? passed++ : failed++;
}

async function main() {
    const aliceLogin = await api('', 'POST', '/auth/demo-login', { userId: 'usr_alice_001' });
    const bobLogin = await api('', 'POST', '/auth/demo-login', { userId: 'usr_bob_002' });
    const aliceTok = aliceLogin.json.token;
    const bobTok = bobLogin.json.token;
    check('demo logins succeed', Boolean(aliceTok && bobTok));

    // Find the seeded Alice↔Bob direct chat
    const chatsRes = await api(aliceTok, 'GET', '/chats');
    const chat = (chatsRes.json.chats ?? []).find((c: any) =>
        (c.peer_user?.id ?? c.other_user?.id) === 'usr_bob_002'
    );
    check('alice has a direct chat with bob', Boolean(chat), chat?.id);

    const tag = `livetok-${Date.now().toString(36)}`;
    const msgRes = await api(aliceTok, 'GET', `/chats/${chat.id}/messages?limit=100`);
    const base = (msgRes.json.messages ?? []).length;

    // Create the message through the service-equivalent path used by tests:
    // reuse existing seeded chat — send via WS is complex here, so use an existing
    // message if present, else fail loudly.
    let source = (msgRes.json.messages ?? []).find((m: any) => m.type === 'TEXT' && !m.is_deleted);
    check('source message exists to forward', Boolean(source), source?.id);

    // Forward without attribution
    const fwd = await api(bobTok, 'POST', '/messages/forward', {
        messageId: source.id,
        targetChatIds: [chat.id],
        hideAttribution: true,
    });
    check(
        'POST /messages/forward returns created copies',
        fwd.status === 200 && Array.isArray(fwd.json.messages) && fwd.json.messages.length === 1,
        `status=${fwd.status}`
    );
    const fwdMsg = fwd.json.messages?.[0];
    check(
        'hidden attribution: sender fields dropped, messageId kept',
        fwdMsg?.forwardedFrom?.messageId === source.id &&
            fwdMsg?.forwardedFrom?.senderId === undefined
    );

    // Forward with attribution
    const fwd2 = await api(bobTok, 'POST', '/messages/forward', {
        messageId: source.id,
        targetChatIds: [chat.id],
    });
    check(
        'attribution kept when not hidden',
        fwd2.status === 200 && fwd2.json.messages?.[0]?.forwardedFrom?.senderName?.length > 0
    );

    // Validation errors
    const bad1 = await api(aliceTok, 'POST', '/messages/forward', {
        messageId: 'nope',
        targetChatIds: [chat.id],
    });
    check('unknown message -> 404', bad1.status === 404, `status=${bad1.status}`);
    const bad2 = await api(aliceTok, 'POST', '/messages/forward', {
        messageId: source.id,
        targetChatIds: [],
    });
    check('empty targets -> 400', bad2.status === 400, `status=${bad2.status}`);

    // FTS via GET /messages/search
    const searchWord = (source.content_text || 'forward').split(/\s+/)[0];
    const s1 = await api(bobTok, 'GET', `/messages/search?q=${encodeURIComponent(searchWord)}`);
    check(
        'GET /messages/search (FTS) returns matches',
        s1.status === 200 && (s1.json.messages ?? []).length > 0,
        `q="${searchWord}" hits=${(s1.json.messages ?? []).length}`
    );
    const s2 = await api(bobTok, 'GET', '/messages/search?q=zzz-definitely-nomatch-42');
    check('FTS no-match returns empty', s2.status === 200 && s2.json.messages.length === 0);
    const s3 = await api(
        bobTok,
        'GET',
        `/messages/search?q=${encodeURIComponent(searchWord)}&chatId=${chat.id}`
    );
    check(
        'chatId-scoped search returns forwarded copies with forwardedFrom',
        s3.status === 200 &&
            s3.json.messages.some((m: any) => m.id === fwdMsg.id && m.forwardedFrom?.messageId)
    );

    console.log(`\nLive forward/FTS checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
