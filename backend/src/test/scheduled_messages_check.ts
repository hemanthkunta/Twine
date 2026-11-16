import { AuthService } from '../services/auth.service.js';
import { ChatService } from '../services/chat.service.js';
import { MessageService } from '../services/message.service.js';
import { ScheduledMessageService } from '../services/scheduledMessage.service.js';

let passed = 0, failed = 0;
function check(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
        .then(fn)
        .then(() => { passed++; console.log(`  PASS  ${name}`); })
        .catch((e) => { failed++; console.log(`  FAIL  ${name}: ${e.message}`); });
}

async function main() {
    console.log('SCHEDULED MESSAGES SUITE');
    const users = AuthService.getAllDemoUsers();
    const alice = users.find((u) => u.username === 'alice');
    const bob = users.find((u) => u.username === 'bob');
    if (!alice || !bob) throw new Error('Seed users missing');
    const chat = await ChatService.getOrCreateDirectChat(alice.id, bob.id);

    let schedId = '';
    const now = Date.now();

    await check('create scheduled message in the future', async () => {
        const s = ScheduledMessageService.create({
            chatId: chat.id, senderId: alice.id,
            contentText: 'future hello', scheduledAt: new Date(now + 60000),
        });
        schedId = s.id;
        if (!s.id) throw new Error('no id');
    });

    await check('listPending shows it', async () => {
        const list = ScheduledMessageService.listPending(chat.id, alice.id);
        if (!list.find((r) => r.id === schedId)) throw new Error('not listed');
    });

    await check('non-member cannot list', async () => {
        const strangerId = 'usr_nobody_000';
        try { ScheduledMessageService.listPending(chat.id, strangerId); throw new Error('allowed'); }
        catch (e) { if (e instanceof Error && e.message === 'allowed') throw e; }
    });

    await check('rejects past date', async () => {
        try {
            ScheduledMessageService.create({ chatId: chat.id, senderId: alice.id, contentText: 'x', scheduledAt: new Date(now - 1000) });
            throw new Error('allowed');
        } catch (e) { if (e instanceof Error && e.message === 'allowed') throw e; }
    });

    await check('rejects > 1 year horizon', async () => {
        try {
            ScheduledMessageService.create({ chatId: chat.id, senderId: alice.id, contentText: 'x', scheduledAt: new Date(now + 400 * 86400000) });
            throw new Error('allowed');
        } catch (e) { if (e instanceof Error && e.message === 'allowed') throw e; }
    });

    await check('cancel works, then gone from pending', async () => {
        ScheduledMessageService.cancel(schedId, alice.id);
        const list = ScheduledMessageService.listPending(chat.id, alice.id);
        if (list.find((r) => r.id === schedId)) throw new Error('still pending');
    });

    await check('due message dispatched through normal send path', async () => {
        const past = ScheduledMessageService.create({
            chatId: chat.id, senderId: alice.id,
            contentText: 'due now', scheduledAt: new Date(now + 1000),
        });
        // force it due by backdating
        (ScheduledMessageService as any);
        const { BaseService } = await import('../services/base.service.js');
        BaseService.execute("UPDATE scheduled_messages SET scheduled_at = datetime('now', '-1 minute') WHERE id = ?", [past.id]);
        const n = await ScheduledMessageService.dispatchDue();
        if (n < 1) throw new Error('nothing dispatched');
        const { BaseService: BS } = await import('../services/base.service.js');
        const row = BS.queryOne<{ sent_message_id: string }>(
            'SELECT sent_message_id FROM scheduled_messages WHERE id = ?', [past.id]);
        if (!row?.sent_message_id) throw new Error('sent_message_id not stamped');
        const msgRow = BS.queryOne<Record<string, unknown>>(
            'SELECT * FROM messages WHERE id = ?', [row.sent_message_id]);
        if (!msgRow) throw new Error('dispatched message missing from messages table');
        if (msgRow.sender_id !== alice.id || msgRow.chat_id !== chat.id)
            throw new Error('dispatched message has wrong sender/chat');
    });

    await check('cancel after dispatch is rejected', async () => {
        const s = ScheduledMessageService.create({
            chatId: chat.id, senderId: alice.id,
            contentText: 'send me', scheduledAt: new Date(now + 1000),
        });
        const { BaseService } = await import('../services/base.service.js');
        BaseService.execute("UPDATE scheduled_messages SET scheduled_at = datetime('now', '-1 minute') WHERE id = ?", [s.id]);
        await ScheduledMessageService.dispatchDue();
        try { ScheduledMessageService.cancel(s.id, alice.id); throw new Error('allowed'); }
        catch (e) { if (e instanceof Error && e.message === 'allowed') throw e; }
    });

    await check('other user cannot cancel', async () => {
        const s = ScheduledMessageService.create({
            chatId: chat.id, senderId: alice.id,
            contentText: 'mine', scheduledAt: new Date(now + 60000),
        });
        try { ScheduledMessageService.cancel(s.id, bob.id); throw new Error('allowed'); }
        catch (e) { if (e instanceof Error && e.message === 'allowed') throw e; }
        ScheduledMessageService.cancel(s.id, alice.id);
    });

    console.log(`\nTotal: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
}
main();
