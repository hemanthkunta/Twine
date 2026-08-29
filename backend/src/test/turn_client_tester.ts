import { TurnService } from '../services/turn.service.js';
import { config } from '../config/index.js';

async function generateTurnDiagnostics() {
    console.log('====================================================');
    console.log('📡 Twine Real-Time TURN Server Diagnostic & Test Tool');
    console.log('====================================================\n');

    const testUserId = 'usr_alice_001';
    const creds = await TurnService.generateCredentials(testUserId);

    console.log('1. Active Server Configuration:');
    console.log('   • URLs:            ', creds.urls.join(', '));
    console.log('   • Ephemeral User:  ', creds.username);
    console.log('   • Ephemeral Pass:  ', creds.credential);
    console.log('   • TTL:             ', creds.ttl, 'seconds (1 hour)\n');

    const firstUrl = creds.urls[0] || 'turn:127.0.0.1:3478';
    const hostPort = firstUrl.replace(/^turns?:/, '');
    const [host, port] = hostPort.split(':');

    console.log('2. Step 4 — Standalone Coturn CLI Verification Command:');
    console.log('   Run this command on any machine with coturn-utils installed:');
    console.log(`   👉 turnutils_uclient -u "${creds.username}" -w "${creds.credential}" -p ${port || 3478} ${host}\n`);

    console.log('3. Step 4 — Browser Trickle ICE Verification (GUI):');
    console.log('   a) Open: https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/');
    console.log('   b) Add TURN server with these exact fields:');
    console.log(`      • TURN URI:   ${firstUrl}`);
    console.log(`      • Username:   ${creds.username}`);
    console.log(`      • Password:   ${creds.credential}`);
    console.log('   c) Click "Gather candidates"');
    console.log('   d) Look for candidateType: "relay" in the table.\n');

    console.log('4. Step 5 — In-App webrtc-internals Verification:');
    console.log('   a) Open chrome://webrtc-internals in a new tab');
    console.log('   b) Place a voice or video call in Twine');
    console.log('   c) Under RTCIceCandidatePair, confirm "nominated = true" and "candidateType = relay"');
    console.log('====================================================');
}

generateTurnDiagnostics().catch(console.error);
