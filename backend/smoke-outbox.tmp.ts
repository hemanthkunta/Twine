import { initDatabase, db } from './src/db/index.js';
import { outboxService } from './src/services/outbox.service.js';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error('FAIL: ' + msg);
        process.exitCode = 1;
    } else {
        console.log('PASS: ' + msg);
    }
}

initDatabase();

// 1. enqueue
const row = outboxService.enqueue({
    chat_id: 'chat_alice_bob_101',
    sender_id: 'usr_alice_001',
    recipient_user_id: 'usr_bob_002',
    temp_id: 'tmp_smoke_1',
    frame: { type: 'MESSAGE', payload: { hello: 'world' }, timestamp: Date.now() },
});
assert(row.status === 'PENDING', 'enqueue inserts PENDING row');

// 2. claimDue
const claimed = outboxService.claimDue(10);
assert(claimed.length >= 1, 'claimDue returns the due row');
const c = claimed.find((x) => x.id === row.id)!;
assert(c.status === 'IN_FLIGHT', 'claimDue flips PENDING -> IN_FLIGHT');
assert(c.frame.type === 'MESSAGE', 'claimed entry carries parsed frame');
const claimed2 = outboxService.claimDue(10);
assert(!claimed2.some((x) => x.id === row.id), 'claimDue does not re-claim IN_FLIGHT rows');

// 3. markDelivered (real message id from the seed data)
assert(outboxService.markDelivered(row.id, 'msg_alice_bob_001'), 'markDelivered updates the row');
const delivered = outboxService.getEntry(row.id)!;
assert(
    delivered.status === 'DELIVERED' && delivered.message_id === 'msg_alice_bob_001',
    'markDelivered sets DELIVERED + message_id'
);

// 3b. a stale message id must not lose the delivery
const row1b = outboxService.enqueue({
    chat_id: 'chat_alice_bob_101',
    sender_id: 'usr_alice_001',
    recipient_user_id: 'usr_bob_002',
    temp_id: 'tmp_smoke_1b',
    frame: { type: 'MESSAGE', payload: {}, timestamp: Date.now() },
});
assert(!!outboxService.claimDue(10).find((x) => x.id === row1b.id), 'row1b claimed');
outboxService.markDelivered(row1b.id, 'msg_does_not_exist_at_all');
const deliveredStale = outboxService.getEntry(row1b.id)!;
assert(
    deliveredStale.status === 'DELIVERED' && deliveredStale.message_id === null,
    'stale message_id still marks DELIVERED without crashing on the FK'
);

// 4. markFailed with backoff
const row2 = outboxService.enqueue({
    chat_id: 'chat_alice_bob_101',
    sender_id: 'usr_alice_001',
    recipient_user_id: 'usr_bob_002',
    temp_id: 'tmp_smoke_2',
    frame: { type: 'MESSAGE', payload: {}, timestamp: Date.now() },
    max_attempts: 2,
});
assert(!!outboxService.claimDue(10).find((x) => x.id === row2.id), 'row2 claimed');
outboxService.markFailed(row2.id, 'first failure');
const afterFail1 = outboxService.getEntry(row2.id)!;
assert(afterFail1.status === 'PENDING' && afterFail1.attempts === 1, 'markFailed requeues below max_attempts');
assert(afterFail1.last_error === 'first failure', 'markFailed records last_error');
const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
assert(
    afterFail1.next_attempt_at > now,
    'markFailed schedules a future next_attempt_at (' + afterFail1.next_attempt_at + ' > ' + now + ')'
);
db.prepare(`UPDATE outbox_queue SET next_attempt_at = datetime('now') WHERE id = ?`).run(row2.id);
assert(!!outboxService.claimDue(10).find((x) => x.id === row2.id), 'requeued row is claimable again');
outboxService.markFailed(row2.id, 'second failure');
const afterFail2 = outboxService.getEntry(row2.id)!;
assert(afterFail2.status === 'FAILED' && afterFail2.attempts === 2, 'markFailed stays FAILED at max_attempts');

// 5. recoverStuck
const row3 = outboxService.enqueue({
    chat_id: 'chat_alice_bob_101',
    sender_id: 'usr_alice_001',
    recipient_user_id: 'usr_bob_002',
    temp_id: 'tmp_smoke_3',
    frame: { type: 'MESSAGE', payload: {}, timestamp: Date.now() },
});
db.prepare(
    `UPDATE outbox_queue SET status = 'IN_FLIGHT', updated_at = datetime('now', '-10 minutes') WHERE id = ?`
).run(row3.id);
const rec = outboxService.recoverStuck();
assert(rec.requeued >= 1, 'recoverStuck requeues stuck IN_FLIGHT rows');
assert(outboxService.getEntry(row3.id)!.status === 'PENDING', 'stuck row is PENDING again');

// 6. expireStale
db.prepare(`UPDATE outbox_queue SET created_at = '2000-01-01 00:00:00' WHERE id = ?`).run(row3.id);
const expiredCount = outboxService.expireStale();
assert(
    expiredCount >= 1 && outboxService.getEntry(row3.id)!.status === 'EXPIRED',
    'expireStale expires old undelivered rows'
);

// 7. processDueQueue with a delivering transport
const row4 = outboxService.enqueue({
    chat_id: 'chat_alice_bob_101',
    sender_id: 'usr_alice_001',
    recipient_user_id: 'usr_bob_002',
    temp_id: 'tmp_smoke_4',
    frame: { type: 'MESSAGE', payload: { n: 4 }, timestamp: Date.now() },
});
outboxService.registerTransport(async () => ({ delivered: true, message_id: 'msg_smoke_4' }));
const deliveredCount = await outboxService.processDueQueue();
assert(deliveredCount >= 1, 'processDueQueue delivers claimed entries via transport');
assert(outboxService.getEntry(row4.id)!.status === 'DELIVERED', 'delivered entry marked DELIVERED');

// 8. throwing transport goes through markFailed
const row5 = outboxService.enqueue({
    chat_id: 'chat_alice_bob_101',
    sender_id: 'usr_alice_001',
    recipient_user_id: 'usr_bob_002',
    temp_id: 'tmp_smoke_5',
    frame: { type: 'MESSAGE', payload: {}, timestamp: Date.now() },
});
outboxService.registerTransport(async () => {
    throw new Error('socket closed');
});
await outboxService.processDueQueue();
const afterThrow = outboxService.getEntry(row5.id)!;
assert(
    afterThrow.status === 'PENDING' && afterThrow.attempts === 1 && afterThrow.last_error === 'socket closed',
    'throwing transport goes through markFailed backoff'
);

// 9. start/stop lifecycle
outboxService.registerTransport(async () => ({ delivered: true }));
outboxService.start();
outboxService.start();
outboxService.stop();
outboxService.stop();
console.log('PASS: start/stop lifecycle runs');

// 10. stats
const stats = outboxService.getQueueStats();
console.log('stats:', JSON.stringify(stats));
assert(stats.DELIVERED >= 3 && stats.FAILED >= 1 && stats.EXPIRED >= 1, 'queue stats reflect final states');

console.log('SMOKE DONE');
