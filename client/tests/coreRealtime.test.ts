import { describe, expect, it } from 'vitest';
import { runCoreRealtimeChecks } from './coreRealtimeHarness';
import { indexedDbAccesses } from './setup';

const EXPECTED_CHECKS = [
    'inactive-chat receipt updates sidebar',
    'late delivery cannot downgrade read',
    'concurrent typists retained',
    'one stop does not erase another typist',
    'disconnect clears typist',
    'missing stop expires automatically',
    'active-chat receipt updates visible message'
];

describe('CORE-07 / CORE-08 realtime regressions', () => {
    it('passes every realtime assertion', async () => {
        // The harness throws with the failing assertion name, so a broken
        // production hook fails the suite loudly instead of silently.
        const passed = await runCoreRealtimeChecks();
        expect(passed).toEqual(EXPECTED_CHECKS);
    });

    it('does not touch IndexedDB on the realtime paths', () => {
        expect(indexedDbAccesses).toEqual([]);
    });
});
