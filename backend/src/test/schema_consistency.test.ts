/**
 * Guards the schema-of-record invariant.
 *
 * `src/db/schema.ts` (SCHEMA_SQL) is what `initDatabase()` executes;
 * `src/db/schema.sql` is the human-readable snapshot. Nothing at runtime reads
 * the .sql file, so without this test the two could silently diverge — which is
 * exactly what happened to the previous revision of schema.sql (it was labelled
 * "PostgreSQL Production Schema" and was missing 6 of the 12 real tables).
 *
 * Run: npm run test:schema
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from '../db/schema.js';
import { emitTestSuiteStarted, emitTestSuiteCompleted } from './testEventEmitter.js';

// Comments carry no meaning for the drift check, and the snapshot deliberately
// has a longer explanatory header, so strip them before comparing.
function normalize(sql: string): string {
    return sql
        .split('\n')
        .map((line) => line.replace(/--.*$/, ''))
        .join('\n')
        .replace(/\s+/g, ' ')
        .trim();
}

function statements(sql: string): string[] {
    return normalize(sql)
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean);
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string): void {
    if (ok) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.log(`  ❌ ${name}`);
        if (detail) console.log(`       ${detail}`);
        failed++;
    }
}

const snapshotPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url));
const snapshotExists = fs.existsSync(snapshotPath);
check('src/db/schema.sql exists', snapshotExists, snapshotPath);

if (snapshotExists) {
    const snapshot = fs.readFileSync(snapshotPath, 'utf8');
    const fromCode = statements(SCHEMA_SQL);
    const fromFile = statements(snapshot);

    check(
        'schema.sql has the same number of statements as SCHEMA_SQL',
        fromCode.length === fromFile.length,
        `SCHEMA_SQL: ${fromCode.length}, schema.sql: ${fromFile.length}`
    );

    const codeSet = new Set(fromCode);
    const fileSet = new Set(fromFile);

    const onlyInCode = fromCode.filter((s) => !fileSet.has(s));
    const onlyInFile = fromFile.filter((s) => !codeSet.has(s));

    check(
        'every SCHEMA_SQL statement appears in schema.sql',
        onlyInCode.length === 0,
        onlyInCode.map((s) => `missing from schema.sql: ${s.slice(0, 90)}`).join('\n       ')
    );
    check(
        'schema.sql contains no statements absent from SCHEMA_SQL',
        onlyInFile.length === 0,
        onlyInFile.map((s) => `extra in schema.sql: ${s.slice(0, 90)}`).join('\n       ')
    );

    // Ordering matters for readability and for anyone restoring from the file,
    // so require the sequences to match rather than just the sets.
    const firstDifference = fromCode.findIndex((s, i) => s !== fromFile[i]);
    check(
        'statement order matches',
        firstDifference === -1,
        firstDifference === -1
            ? undefined
            : `first difference at statement ${firstDifference + 1}`
    );

    // A regression guard: if someone deletes a table from both places at once,
    // the drift check above would happily pass.
    const expectedTables = [
        'blocked_users',
        'chat_members',
        'chats',
        'group_sender_keys',
        'identity_keys',
        'message_reactions',
        'message_receipts',
        'messages',
        'pinned_messages',
        'push_subscriptions',
        'user_sessions',
        'users',
    ];
    const createdTables = new Set(
        fromCode
            .map((s) => /CREATE TABLE IF NOT EXISTS ([a-z_]+)/.exec(s)?.[1])
            .filter((t): t is string => Boolean(t))
    );
    const missingTables = expectedTables.filter((t) => !createdTables.has(t));
    check(
        'all expected tables are defined',
        missingTables.length === 0,
        `missing: ${missingTables.join(', ')}`
    );
}

console.log(`\nTotal Schema Checks: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
