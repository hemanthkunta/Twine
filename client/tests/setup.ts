import { beforeEach } from 'vitest';

// React 18 only allows `act()` outside a DOM test framework when this flag is
// set; without it every act() call warns and updates are not flushed.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom ships no IndexedDB, but the realtime hook transitively imports the
// offline storage service (client/src/services/storage.ts) and the Signal
// protocol store. Both resolve their database lazily inside methods, so the
// CORE-07/CORE-08 paths never need it.
//
// The stub below therefore does NOT implement IndexedDB. It only records
// accesses and throws a descriptive error if `open()` is ever reached, so an
// accidental database dependency fails loudly instead of hanging on an
// unimplemented browser API. `coreRealtime.test.ts` asserts the recorded list
// stays empty, which is what keeps the stub honest.
//
// The list lives on globalThis so every module instance of this file (the
// setup file and the test file that imports it) observes the same records.
const ACCESSES_KEY = '__coreRealtimeIndexedDbAccesses';

export const indexedDbAccesses: string[] =
    ((globalThis as unknown as Record<string, string[]>)[ACCESSES_KEY] ??= []);

if (typeof globalThis.indexedDB === 'undefined') {
    Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        writable: true,
        value: {
            open(name: string) {
                indexedDbAccesses.push(`open:${name}`);
                throw new Error(`indexedDB.open("${name}") was reached by a code path that is supposed to be database-free`);
            }
        }
    });
}

// The hook keeps a typing-expiry interval alive between checks; reset the
// document between tests so one check cannot leak listeners into the next.
beforeEach(() => {
    document.body.innerHTML = '';
});
