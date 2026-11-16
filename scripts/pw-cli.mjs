import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
for (const dir of fs.readdirSync(cache)) {
 const folder = path.join(cache, dir, 'node_modules', '@playwright', 'cli');
 if (!fs.existsSync(path.join(folder, 'package.json'))) continue;
 const pkg = JSON.parse(fs.readFileSync(path.join(folder, 'package.json')));
 const executable = typeof pkg.bin === 'string' ? pkg.bin : Object.values(pkg.bin)[0];
 const result = spawnSync(process.execPath, [path.join(folder, executable), ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true });
 process.exit(result.status ?? 1);
}
throw new Error('Playwright CLI not cached; run npx --package @playwright/cli playwright-cli --help');
