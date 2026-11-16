import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'twine-regression-'));
const suites = ['schema_consistency.test.ts', 'security_audit_suite.ts', 'comprehensive_suite.ts', 'otp_flow.test.ts', 'forward_fts_check.ts'];
fs.mkdirSync('output/core-audit', { recursive: true });
let failed = false;
for (const suite of suites) {
 const result = spawnSync(process.execPath, ['--import', 'tsx', `src/test/${suite}`], {
  cwd: 'backend', windowsHide: true, encoding: 'utf8', timeout: 90000,
  env: { ...process.env, NODE_ENV: 'test', SMS_PROVIDER: 'test', DB_PATH: path.join(directory, `${suite}.db`), UPLOADS_DIR: path.join(directory, 'uploads') },
 });
 fs.writeFileSync(`output/core-audit/${suite}.log`, (result.stdout || '') + (result.stderr || ''));
 console.log(`${suite}: ${result.status === 0 ? 'PASS' : 'FAIL'}${result.error ? ' ' + result.error.message : ''}`);
 if (result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
