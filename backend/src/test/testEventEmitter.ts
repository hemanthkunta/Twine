import https from 'https';
import { config } from '../config/index.js';

/**
 * Send a test event to the backend's /api/test-events endpoint so it can be
 * broadcast to all connected dashboard clients.
 *
 * Test suites run as standalone processes, so they can't emit dashboard events
 * directly. Instead they POST the event to the running backend, which forwards
 * it to every connected dashboard WebSocket client.
 *
 * The call is fire-and-forget: a failure to reach the backend should never
 * fail a test suite, so all errors are swallowed and logged to stderr.
 */
export function sendTestEvent(type: string, payload: any): void {
    const data = JSON.stringify({ type, payload });

    const options = {
        hostname: 'localhost',
        port: config.port,
        path: '/api/test-events',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
        },
    };

    const req = https.request(options, (res) => {
        res.resume(); // drain the response so the socket can be reused
    });

    req.on('error', (error) => {
        console.error(`[testEventEmitter] Failed to send test event "${type}": ${error.message}`);
    });

    req.setTimeout(2000, () => {
        req.destroy();
    });

    req.write(data);
    req.end();
}

/**
 * Convenience wrapper emitting a suite start event.
 */
export function emitTestSuiteStarted(suite: string): void {
    sendTestEvent('dashboard:test_suite_started', {
        suite,
        timestamp: new Date().toISOString(),
    });
}

/**
 * Convenience wrapper emitting a suite completion event with pass/fail counts.
 */
export function emitTestSuiteCompleted(
    suite: string,
    passed: number,
    failed: number,
    total: number
): void {
    sendTestEvent('dashboard:test_suite_completed', {
        suite,
        passed,
        failed,
        total,
        successRate: total > 0 ? (passed / total) * 100 : 0,
        timestamp: new Date().toISOString(),
    });
}