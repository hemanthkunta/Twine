import { execFileSync } from 'node:child_process';

function git(args, options = {}) {
    return execFileSync('git', args, {
        encoding: 'utf8',
        stdio: 'inherit',
        ...options,
    });
}

function gitOutput(args) {
    return execFileSync('git', args, {
        encoding: 'utf8',
    }).trim();
}

function fail(message) {
    console.error(`\n❌ ${message}\n`);
    process.exit(1);
}

console.log('\n============================================================');
console.log('       AETHER MESSAGING PROJECT - AUTO SYNC');
console.log('============================================================\n');

// ------------------------------------------------------------
// 1. Verify Git repository
// ------------------------------------------------------------

try {
    git(['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
} catch {
    fail('This directory is not a Git repository.');
}

// ------------------------------------------------------------
// 2. Current branch
// ------------------------------------------------------------

const branch = gitOutput(['branch', '--show-current']);

if (!branch) {
    fail('Could not determine the current Git branch.');
}

console.log(`Current branch: ${branch}\n`);

// ------------------------------------------------------------
// 3. Prevent detached HEAD
// ------------------------------------------------------------

try {
    git(['symbolic-ref', '--short', 'HEAD'], { stdio: 'ignore' });
} catch {
    fail('Repository is in detached HEAD state.');
}

// ------------------------------------------------------------
// 4. Fetch latest remote
// ------------------------------------------------------------

console.log('[1/7] Fetching latest changes...');

try {
    git(['fetch', 'origin']);
} catch {
    fail('git fetch failed. Check your internet connection and GitHub access.');
}

console.log('Fetch successful.\n');

// ------------------------------------------------------------
// 5. Detect local changes
// ------------------------------------------------------------

console.log('[2/7] Checking local changes...');

const status = gitOutput(['status', '--porcelain']);

if (status) {
    console.log('\nLocal changes detected:\n');
    git(['status', '--short']);

    console.log('\nCreating automatic checkpoint commit...');

    git(['add', '-A']);

    const timestamp = new Date()
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, ' UTC');

    try {
        git([
            'commit',
            '-m',
            `sync: automatic checkpoint ${timestamp}`,
        ]);
    } catch {
        fail('Commit failed.');
    }

    console.log('Local changes committed.\n');
} else {
    console.log('No local changes.\n');
}

// ------------------------------------------------------------
// 6. Rebase onto latest origin/main
// ------------------------------------------------------------

console.log(`[3/7] Synchronizing with origin/${branch}...`);

try {
    git(['pull', '--rebase', 'origin', branch]);
} catch {
    console.log('\n============================================================');
    console.log('❌ SYNC STOPPED - MERGE CONFLICT');
    console.log('============================================================\n');

    console.log('Git has stopped safely so nobody\'s work is overwritten.\n');

    console.log('Check the conflicted files with:');
    console.log('    git status\n');

    console.log('After resolving the conflicts:');
    console.log('    git add .');
    console.log('    git rebase --continue\n');

    console.log('Then run:');
    console.log('    npm run sync\n');

    process.exit(1);
}

console.log('Remote changes synchronized.\n');

// ------------------------------------------------------------
// 7. Push
// ------------------------------------------------------------

console.log('[4/7] Pushing local changes...');

try {
    git(['push', 'origin', branch]);
} catch {
    console.log('\n❌ Push failed.');
    console.log('The remote may have changed again.');
    console.log('Run npm run sync again.\n');
    process.exit(1);
}

console.log('Push successful.\n');

// ------------------------------------------------------------
// 8. Verify remote
// ------------------------------------------------------------

console.log('[5/7] Verifying remote state...');

try {
    git(['fetch', 'origin']);
} catch {
    fail('Verification fetch failed.');
}

console.log('Remote state verified.\n');

// ------------------------------------------------------------
// 9. Check final status
// ------------------------------------------------------------

console.log('[6/7] Checking working tree...');

const finalStatus = gitOutput(['status', '--porcelain']);

if (finalStatus) {
    console.log('\n⚠️ Working tree still contains changes:\n');
    git(['status', '--short']);
} else {
    console.log('Working tree is clean.');
}

console.log('');

// ------------------------------------------------------------
// 10. Final information
// ------------------------------------------------------------

console.log('[7/7] SYNC COMPLETE\n');

console.log('============================================================');
console.log(`Your project is synchronized with origin/${branch}`);
console.log('============================================================\n');

git(['log', '-1', '--oneline']);

console.log('');