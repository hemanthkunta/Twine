/**
 * Functional check for message forwarding + FTS5 search.
 * In-process: uses the real service layer against the dev database.
 * Run: npx tsx src/test/forward_fts_check.ts
 */
import { db, initDatabase } from '../db/index.js';
import { ChatService } from '../services/chat.service.js';
import { MessageService } from '../services/message.service.js';

initDatabase();

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string): void {
    console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
    ok ? passed++ : failed++;
}

const alice = 'usr_alice_001';
const bob = 'usr_bob_002';

async function main() {
    // Two fresh direct chats. Force plaintext (non-E2EE) so FTS and content
    // assertions see the real text — E2EE ciphertext is unsearchable by design.
    const sourceChat = await ChatService.getOrCreateDirectChat(alice, bob);
    const targetChat = await ChatService.getOrCreateDirectChat(bob, alice);
    db.prepare('UPDATE chats SET is_e2ee = 0 WHERE id IN (?, ?)').run(sourceChat.id, targetChat.id);

    // --- Forwarding ---
    const original = await MessageService.createMessage({
        chatId: sourceChat.id,
        senderId: alice,
        contentText: 'invoice payload kimeta-2941',
    });

    const [withAttr] = await MessageService.forwardMessage({
        userId: bob,
        messageId: original.id,
        targetChatIds: [sourceChat.id],
    });
    check('forward with attribution creates a new message', Boolean(withAttr?.id));
    check(
        'forwardedFrom.messageId points at source',
        withAttr?.forwardedFrom?.messageId === original.id
    );
    check(
        'forwardedFrom.senderId/senderName kept with attribution',
        withAttr?.forwardedFrom?.senderId === alice &&
            withAttr?.forwardedFrom?.senderName === 'Alice Walker'
    );
    check(
        'forward copies content',
        withAttr?.content_text === 'invoice payload kimeta-2941'
    );

    const [hidden] = await MessageService.forwardMessage({
        userId: alice,
        messageId: original.id,
        targetChatIds: [targetChat.id],
        hideAttribution: true,
    });
    check(
        'hidden attribution drops sender fields but keeps messageId',
        hidden?.forwardedFrom?.messageId === original.id &&
            hidden?.forwardedFrom?.senderId === undefined &&
            hidden?.forwardedFrom?.senderName === undefined
    );

    // Validation errors
    const outsider = db
        .prepare(`SELECT id FROM users WHERE id NOT IN (?, ?) LIMIT 1`)
        .get(alice, bob) as { id: string } | undefined;
    let threw = false;
    try {
        await MessageService.forwardMessage({
            userId: outsider?.id ?? 'nobody',
            messageId: original.id,
            targetChatIds: [sourceChat.id],
        });
    } catch {
        threw = true;
    }
    check('non-member of source chat cannot forward', threw);

    threw = false;
    try {
        await MessageService.forwardMessage({
            userId: alice,
            messageId: original.id,
            targetChatIds: ['chat_does_not_exist'],
        });
    } catch {
        threw = true;
    }
    check('forwarding to a non-member target chat rejected', threw);

    // --- FTS search ---
    const hits = await MessageService.searchMessages(bob, { query: 'kimeta' });
    check(
        'FTS MATCH finds the token across chats',
        hits.some((m) => m.id === original.id),
        `hits=${hits.length}`
    );

    const multi = await MessageService.searchMessages(bob, { query: 'invoice kimeta' });
    check('multi-token OR query works', multi.length >= 1, `hits=${multi.length}`);

    const miss = await MessageService.searchMessages(bob, { query: 'zzz-no-such-token' });
    check('non-matching token returns nothing', miss.length === 0, `hits=${miss.length}`);

    // Edit syncs the FTS mirror via trigger
    await MessageService.editMessage(original.id, alice, 'renamed payload quixotic-7');
    const oldHits = await MessageService.searchMessages(bob, { query: 'kimeta', chatId: sourceChat.id });
    const newHits = await MessageService.searchMessages(bob, { query: 'quixotic', chatId: sourceChat.id });
    check(
        'FTS mirror updates on edit',
        !oldHits.some((m) => m.id === original.id) && newHits.some((m) => m.id === original.id),
        `old=${oldHits.length} new=${newHits.length}`
    );

    // Search results carry forwardedFrom (forward holds the pre-edit text)
    const fwdHits = await MessageService.searchMessages(bob, { query: 'kimeta' });
    const fwdRow = fwdHits.find((m) => m.id === withAttr.id);
    check(
        'search results include forwardedFrom payload',
        fwdRow?.forwardedFrom?.messageId === original.id
    );

    console.log(`\nForward/FTS checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
