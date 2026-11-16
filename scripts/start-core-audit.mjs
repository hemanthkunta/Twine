import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const out = path.join(root, 'output', 'core-audit');
fs.mkdirSync(out, { recursive: true });
if (process.argv.includes('--restart')) {
  const pids = JSON.parse(fs.readFileSync(path.join(out, 'pids.json'), 'utf8'));
  for (const pid of Object.values(pids)) { try { process.kill(pid); } catch {} }
}
const previous = process.argv.includes('--restart') && !process.argv.includes('--fresh') ? fs.readdirSync(out).filter(n => /^live-\d+\.db$/.test(n)).sort().at(-1) : null;
const run = (name, args, cwd, env) => {
  const log = fs.openSync(path.join(out, `${name}.log`), 'a');
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, detached: true,
    windowsHide: true, stdio: ['ignore', log, log] });
  child.unref();
  return child.pid;
};
const backend = run('server', ['--import', 'tsx', 'src/server.ts'], path.join(root, 'backend'), {
  NODE_ENV: 'test', SMS_PROVIDER: 'test', PORT: '4407', CORS_ORIGIN: 'http://localhost:4408',
  DB_PATH: path.join(out, previous || `live-${Date.now()}.db`), UPLOADS_DIR: path.join(out, 'uploads'),
  JWT_SECRET: 'isolated-core-audit-secret-not-for-production',
});
const client = run('client', ['node_modules/vite/bin/vite.js', '--port', '4408', '--host', '127.0.0.1'],
  path.join(root, 'client'), { VITE_PROXY_TARGET: 'http://localhost:4407' });
fs.writeFileSync(path.join(out, 'pids.json'), JSON.stringify({ backend, client }));
console.log({ backend, client, url: 'http://localhost:4408' });
