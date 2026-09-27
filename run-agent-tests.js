#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

interface TestConfig {
  name: string;
  command: string;
  description: string;
}

const TEST_CONFIGS: TestConfig[] = [
  {
    name: 'auth',
    command: 'npx playwright test tests/agents/auth.test.ts',
    description: 'Authentication flow tests',
  },
  {
    name: 'direct-messaging',
    command: 'npx playwright test tests/agents/direct-messaging.test.ts',
    description: 'Direct messaging tests',
  },
  {
    name: 'group-messaging',
    command: 'npx playwright test tests/agents/group-messaging.test.ts',
    description: 'Group messaging tests',
  },
  {
    name: 'webrtc-calling',
    command: 'npx playwright test tests/agents/webrtc-calling.test.ts',
    description: 'WebRTC calling tests',
  },
  {
    name: 'presence-typing',
    command: 'npx playwright test tests/agents/presence-typing.test.ts',
    description: 'Presence and typing indicator tests',
  },
  {
    name: 'multi-device-sync',
    command: 'npx playwright test tests/agents/multi-device-sync.test.ts',
    description: 'Multi-device sync tests',
  },
  {
    name: 'parallel-runner',
    command: 'npx playwright test tests/agents/parallel-runner.test.ts',
    description: 'Parallel agent stress tests',
  },
  {
    name: 'all',
    command: 'npx playwright test tests/agents/',
    description: 'All agent tests',
  },
  {
    name: 'all-headed',
    command: 'npx playwright test tests/agents/ --headed',
    description: 'All agent tests (headed mode)',
  },
  {
    name: 'all-debug',
    command: 'npx playwright test tests/agents/ --debug',
    description: 'All agent tests (debug mode)',
  },
  {
    name: 'chromium',
    command: 'npx playwright test tests/agents/ --project=chromium',
    description: 'All tests on Chromium only',
  },
  {
    name: 'firefox',
    command: 'npx playwright test tests/agents/ --project=firefox',
    description: 'All tests on Firefox only',
  },
  {
    name: 'webkit',
    command: 'npx playwright test tests/agents/ --project=webkit',
    description: 'All tests on WebKit only',
  },
  {
    name: 'mobile',
    command: 'npx playwright test tests/agents/ --project=mobile-chrome --project=mobile-safari',
    description: 'All tests on mobile browsers',
  },
  {
    name: 'ci',
    command: 'npx playwright test tests/agents/ --reporter=github',
    description: 'CI mode with GitHub reporter',
  },
];

function printUsage() {
  console.log(`
🤖 Agent Test Runner for Messaging Project
=============================================

Usage: node run-agent-tests.js <command> [options]

Available Commands:
`);

  TEST_CONFIGS.forEach(config => {
    console.log(`  ${config.name.padEnd(20)} - ${config.description}`);
  });

  console.log(`
Options:
  --base-url <url>     Base URL for the app (default: http://localhost:3000)
  --api-url <url>      API URL (default: http://localhost:4000)
  --workers <n>        Number of parallel workers
  --retries <n>        Number of retries on failure
  --timeout <ms>       Test timeout in milliseconds
  --headed             Run in headed mode
  --debug              Run in debug mode
  --reporter <type>    Reporter type (line, html, json, github)
  --help               Show this help message

Examples:
  node run-agent-tests.js auth
  node run-agent-tests.js all --headed
  node run-agent-tests.js parallel-runner --workers=2
  node run-agent-tests.js all --base-url=http://localhost:3000
`);
}

function runCommand(command: string, env: NodeJS.ProcessEnv): void {
  console.log(`\n🚀 Running: ${command}\n`);
  
  try {
    execSync(command, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      cwd: process.cwd(),
    });
    console.log('\n✅ Command completed successfully');
  } catch (error: any) {
    console.error('\n❌ Command failed:', error.message);
    process.exit(error.status || 1);
  }
}

function main() {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  const commandName = args[0];
  const config = TEST_CONFIGS.find(c => c.name === commandName);

  if (!config) {
    console.error(`❌ Unknown command: ${commandName}`);
    printUsage();
    process.exit(1);
  }

  const env: NodeJS.ProcessEnv = {};
  
  const baseUrlIdx = args.indexOf('--base-url');
  if (baseUrlIdx !== -1 && args[baseUrlIdx + 1]) {
    env.PW_BASE_URL = args[baseUrlIdx + 1];
  }

  const apiUrlIdx = args.indexOf('--api-url');
  if (apiUrlIdx !== -1 && args[apiUrlIdx + 1]) {
    env.PW_API_URL = args[apiUrlIdx + 1];
  }

  if (args.includes('--headed')) {
    config.command += ' --headed';
  }

  if (args.includes('--debug')) {
    config.command += ' --debug';
  }

  const workersIdx = args.indexOf('--workers');
  if (workersIdx !== -1 && args[workersIdx + 1]) {
    config.command += ` --workers=${args[workersIdx + 1]}`;
  }

  const retriesIdx = args.indexOf('--retries');
  if (retriesIdx !== -1 && args[retriesIdx + 1]) {
    config.command += ` --retries=${args[retriesIdx + 1]}`;
  }

  const timeoutIdx = args.indexOf('--timeout');
  if (timeoutIdx !== -1 && args[timeoutIdx + 1]) {
    config.command += ` --timeout=${args[timeoutIdx + 1]}`;
  }

  const reporterIdx = args.indexOf('--reporter');
  if (reporterIdx !== -1 && args[reporterIdx + 1]) {
    config.command += ` --reporter=${args[reporterIdx + 1]}`;
  }

  console.log(`📋 Test: ${config.description}`);
  console.log(`🔧 Command: ${config.command}`);

  runCommand(config.command, env);
}

main();