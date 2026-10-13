/**
 * One-off helper: regenerate src/db/schema.sql from SCHEMA_SQL so the
 * snapshot stays in lockstep with the schema of record. Keep the human
 * header comment, then dump SCHEMA_SQL verbatim.
 * Run: npx tsx src/test/_regen_schema_snapshot.ts
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEMA_SQL } from '../db/schema.js';

const HEADER = `-- Reference snapshot of the SQLite schema.
--
-- THIS FILE IS NOT READ AT RUNTIME. The authoritative definition is the
-- \`SCHEMA_SQL\` constant in \`src/db/schema.ts\`, which is what \`initDatabase()\`
-- executes. This file exists so the schema can be read (and diffed) without
-- wading through TypeScript.
--
-- \`src/test/schema_consistency.test.ts\` fails if this file and SCHEMA_SQL stop
-- matching, so edit either one and the other must follow.
--
-- Engine: SQLite via \`node:sqlite\`. Do not rewrite this in PostgreSQL dialect:
-- the types and \`datetime('now')\` defaults below are what the server actually
-- runs. (An earlier revision of this file claimed to be a "PostgreSQL Production
-- Schema" while being neither PostgreSQL nor accurate.)

`;

const snapshotPath = fileURLToPath(new URL('../db/schema.sql', import.meta.url));
fs.writeFileSync(snapshotPath, HEADER + SCHEMA_SQL.trimStart(), 'utf8');
console.log('schema.sql regenerated from SCHEMA_SQL');
