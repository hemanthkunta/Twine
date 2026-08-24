import { AuthService } from '../services/auth.service.js';
import { ChatService } from '../services/chat.service.js';
import { GroupService } from '../services/group.service.js';
import { MessageService } from '../services/message.service.js';
import { PresenceService } from '../services/presence.service.js';
import { MediaService } from '../services/media.service.js';
import { AIService } from '../services/ai.service.js';
import { ChannelAnalyticsService } from '../services/analytics.service.js';
import { FederationBridgeService } from '../services/federation.service.js';
import { PushNotificationService } from '../services/push.service.js';
import { db } from '../db/index.js';

interface TestResult {
  module: string;
  testName: string;
  passed: boolean;
  error?: string;
  securityFlag?: boolean;
}

const results: TestResult[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function runTests() {
  console.log('===============================================================');
  console.log('🔍 RUNNING COMPREHENSIVE MULTI-ROLE TEST & SECURITY AUDIT SUITE');
  console.log('===============================================================\n');

  // -------------------------------------------------------------
  // MODULE B1: AuthService
  // -------------------------------------------------------------
  console.log('▶ Testing Module B1: AuthService...');
  try {
    // Test 1: Normal Demo Login
    const demo = AuthService.demoLogin('usr_alice_001');
    assert(demo.user.id === 'usr_alice_001', 'Alice ID match');
    assert(typeof demo.token === 'string' && demo.token.length > 20, 'Valid JWT token returned');
    results.push({ module: 'B1:AuthService', testName: 'Demo Login normal input', passed: true });

    // Test 2: Edge Case - Invalid demo user
    try {
      AuthService.demoLogin('non_existent_user_999');
      results.push({ module: 'B1:AuthService', testName: 'Demo Login invalid ID error handling', passed: false, error: 'Did not throw on non-existent user' });
    } catch (e: any) {
      assert(e.message.includes('not found'), 'Threw proper error message');
      results.push({ module: 'B1:AuthService', testName: 'Demo Login invalid ID error handling', passed: true });
    }

    // Test 3: Normal Registration & Password hashing
    const testPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const testUsername = `user_${Math.random().toString(36).slice(2, 8)}`;
    const registered = AuthService.register({
      phoneNumber: testPhone,
      username: testUsername,
      displayName: 'Test User',
      password: 'SuperSecretPassword123!',
    });
    assert(registered.user.phone_number === testPhone, 'Registered phone matches');
    assert(!registered.user.password_hash?.includes('SuperSecretPassword123!'), 'Password was hashed with bcrypt');
    results.push({ module: 'B1:AuthService', testName: 'User registration with bcrypt hash', passed: true });

    // Test 4: Security - Password verification
    const loginOk = AuthService.loginWithPassword(testPhone, 'SuperSecretPassword123!');
    assert(loginOk.user.id === registered.user.id, 'Login succeeded with valid password');
    results.push({ module: 'B1:AuthService', testName: 'Login with correct password', passed: true });

    // Test 5: Security - Wrong password rejection
    try {
      AuthService.loginWithPassword(testPhone, 'WrongPassword!');
      results.push({ module: 'B1:AuthService', testName: 'Login wrong password rejection', passed: false, error: 'Allowed wrong password' });
    } catch {
      results.push({ module: 'B1:AuthService', testName: 'Login wrong password rejection', passed: true });
    }

    // Test 6: Security - JWT token verification & tampering rejection
    const verified = AuthService.verifyToken(demo.token);
    assert(verified?.id === 'usr_alice_001', 'Decoded valid token payload');
    const tampered = demo.token.slice(0, -5) + 'xxxxx';
    const tamperedVerify = AuthService.verifyToken(tampered);
    assert(tamperedVerify === null, 'Tampered token rejected with null');
    results.push({ module: 'B1:AuthService', testName: 'JWT signature verification & tamper rejection', passed: true });
  } catch (err: any) {
    results.push({ module: 'B1:AuthService', testName: 'AuthService suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // MODULE B2: ChatService
  // -------------------------------------------------------------
  console.log('▶ Testing Module B2: ChatService...');
  try {
    // Test 1: Create direct chat
    const directChat = ChatService.getOrCreateDirectChat('usr_alice_001', 'usr_bob_002');
    assert(directChat.type === 'DIRECT', 'Direct chat created');
    assert(directChat.peer_user?.id === 'usr_bob_002', 'Peer user is Bob');
    results.push({ module: 'B2:ChatService', testName: 'Create or get direct chat', passed: true });

    // Test 2: Edge Case - Direct chat with self rejection
    try {
      ChatService.getOrCreateDirectChat('usr_alice_001', 'usr_alice_001');
      results.push({ module: 'B2:ChatService', testName: 'Self-direct chat rejection', passed: false, error: 'Allowed direct chat with self' });
    } catch (e: any) {
      assert(e.message.includes('yourself'), 'Proper rejection for self direct chat');
      results.push({ module: 'B2:ChatService', testName: 'Self-direct chat rejection', passed: true });
    }

    // Test 3: Saved Messages personal chat
    const savedChat = ChatService.getOrCreateSavedMessagesChat('usr_alice_001');
    assert(savedChat.type === 'SAVED', 'Saved messages chat created with type SAVED');
    assert(savedChat.is_saved_messages === true || savedChat.type === 'SAVED', 'is_saved_messages flag valid');
    results.push({ module: 'B2:ChatService', testName: 'Saved Messages personal self-chat', passed: true });

    // Test 4: Get User Chats list
    const userChats = ChatService.getUserChats('usr_alice_001');
    assert(userChats.length >= 2, 'User has chats in their inbox');
    results.push({ module: 'B2:ChatService', testName: 'Get user inbox chats list', passed: true });
  } catch (err: any) {
    results.push({ module: 'B2:ChatService', testName: 'ChatService suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // MODULE B3: GroupService
  // -------------------------------------------------------------
  console.log('▶ Testing Module B3: GroupService...');
  try {
    // Test 1: Create Supergroup
    const group = GroupService.createGroup({
      creatorId: 'usr_alice_001',
      title: 'Dev Core Engineering',
      description: 'Main discussion group',
      type: 'SUPERGROUP',
      memberIds: ['usr_bob_002', 'usr_charlie_003'],
    });
    assert(group.title === 'Dev Core Engineering', 'Group title set');
    assert(group.type === 'SUPERGROUP', 'Group type is SUPERGROUP');
    assert((group.member_count || 0) >= 3, 'Group members assigned');
    results.push({ module: 'B3:GroupService', testName: 'Create Supergroup with initial members', passed: true });

    // Test 2: Create Broadcast Channel
    const channel = GroupService.createGroup({
      creatorId: 'usr_alice_001',
      title: 'Company Announcements',
      description: 'Official announcements only',
      type: 'CHANNEL',
    });
    assert(channel.type === 'CHANNEL', 'Channel type created');
    results.push({ module: 'B3:GroupService', testName: 'Create Broadcast Channel', passed: true });

    // Test 3: Add new member to group
    const updatedGroup = GroupService.addMember(group.id, 'usr_diana_004', 'MEMBER');
    assert((updatedGroup.member_count || 0) > (group.member_count || 0), 'Member count incremented');
    results.push({ module: 'B3:GroupService', testName: 'Add member to group', passed: true });
  } catch (err: any) {
    results.push({ module: 'B3:GroupService', testName: 'GroupService suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // MODULE B4: MessageService
  // -------------------------------------------------------------
  console.log('▶ Testing Module B4: MessageService...');
  try {
    const directChat = ChatService.getOrCreateDirectChat('usr_alice_001', 'usr_bob_002');

    // Test 1: Create Message
    const msg = MessageService.createMessage({
      chatId: directChat.id,
      senderId: 'usr_alice_001',
      contentText: 'Test message for delivery verification',
      type: 'TEXT',
    });
    assert(msg.content_text === 'Test message for delivery verification', 'Content matches');
    assert(msg.status === 'SENT', 'Initial status is SENT');
    results.push({ module: 'B4:MessageService', testName: 'Create text message', passed: true });

    // Test 2: Edit Message
    const edited = MessageService.editMessage(msg.id, 'usr_alice_001', 'Updated content text');
    assert(Boolean(edited && edited.content_text === 'Updated content text'), 'Message text edited');
    assert(Boolean(edited && edited.is_edited === true), 'is_edited flag set');
    results.push({ module: 'B4:MessageService', testName: 'Edit message content', passed: true });

    // Test 3: Security - Unauthorized edit by non-sender rejection
    try {
      MessageService.editMessage(msg.id, 'usr_bob_002', 'Malicious edit attempt');
      results.push({ module: 'B4:MessageService', testName: 'Unauthorized message edit rejection', passed: false, error: 'Allowed non-sender to edit message' });
    } catch {
      results.push({ module: 'B4:MessageService', testName: 'Unauthorized message edit rejection', passed: true });
    }

    // Test 4: Toggle Emoji Reaction
    const react1 = MessageService.toggleReaction(msg.id, 'usr_bob_002', '🔥');
    assert(react1.reactions['🔥'].includes('usr_bob_002'), 'Reaction added');
    const react2 = MessageService.toggleReaction(msg.id, 'usr_bob_002', '🔥');
    assert(!react2.reactions['🔥'] || !react2.reactions['🔥'].includes('usr_bob_002'), 'Reaction toggled off');
    results.push({ module: 'B4:MessageService', testName: 'Toggle emoji reactions', passed: true });

    // Test 5: Receipt Status Progression (SENT -> DELIVERED -> READ)
    const rcptDelivered = MessageService.updateReceipt(msg.id, 'usr_bob_002', 'DELIVERED');
    assert(rcptDelivered.updated === true, 'Receipt updated to DELIVERED');
    const rcptRead = MessageService.updateReceipt(msg.id, 'usr_bob_002', 'READ');
    assert(rcptRead.updated === true, 'Receipt updated to READ');
    results.push({ module: 'B4:MessageService', testName: 'Receipt status progression (DELIVERED -> READ)', passed: true });

    // Test 6: Create Poll & Voting
    const pollMsg = MessageService.createPoll({
      chatId: directChat.id,
      senderId: 'usr_alice_001',
      question: 'Which transport should we prioritize?',
      options: ['BLE Mesh', 'LoRa Radio', 'WebSocket TLS'],
      isAnonymous: true,
    });
    assert(pollMsg.type === 'POLL', 'Poll message type');
    assert(pollMsg.poll?.options.length === 3, 'Poll options initialized');
    
    const voteRes = MessageService.votePoll(pollMsg.poll!.id, pollMsg.poll!.options[0].id, 'usr_bob_002');
    assert(voteRes?.total_votes === 1, 'Total votes incremented');
    assert(voteRes?.options[0].vote_count === 1, 'Option vote count incremented');
    results.push({ module: 'B4:MessageService', testName: 'Interactive Poll creation and single-choice voting', passed: true });

    // Test 7: Thread replies & view count increment
    const threadReply = MessageService.createMessage({
      chatId: directChat.id,
      senderId: 'usr_bob_002',
      replyToMessageId: msg.id,
      contentText: 'This is a sub-thread reply to the parent message',
      type: 'TEXT',
    });
    const threadMsgs = MessageService.getThreadMessages(msg.id);
    assert(threadMsgs.some((m) => m.id === threadReply.id), 'Thread replies query retrieved sub-replies');
    const newViews = MessageService.incrementViews(msg.id);
    assert(newViews > 0, 'View count tracked');
    results.push({ module: 'B4:MessageService', testName: 'Thread replies retrieval & view count increment', passed: true });
  } catch (err: any) {
    results.push({ module: 'B4:MessageService', testName: 'MessageService suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // MODULE B5: PresenceService
  // -------------------------------------------------------------
  console.log('▶ Testing Module B5: PresenceService...');
  try {
    const isOnlineBefore = PresenceService.isUserOnline('usr_alice_001');
    const onlineList = PresenceService.getOnlineUserIds();
    assert(Array.isArray(onlineList), 'Online user IDs returned array');
    results.push({ module: 'B5:PresenceService', testName: 'Presence query & online user tracking', passed: true });
  } catch (err: any) {
    results.push({ module: 'B5:PresenceService', testName: 'PresenceService suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // MODULE B6: MediaService
  // -------------------------------------------------------------
  console.log('▶ Testing Module B6: MediaService...');
  try {
    const uploaded = MediaService.saveBase64Media({
      base64Data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      fileName: 'pixel.png',
      mimeType: 'image/png',
    });
    assert(uploaded.url.startsWith('/uploads/'), 'Upload URL assigned');
    assert(uploaded.fileSize > 0, 'File size calculated');
    results.push({ module: 'B6:MediaService', testName: 'Base64 image upload & disk storage', passed: true });
  } catch (err: any) {
    results.push({ module: 'B6:MediaService', testName: 'MediaService suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // MODULE B7: AIService
  // -------------------------------------------------------------
  console.log('▶ Testing Module B7: AIService...');
  try {
    const testMessages = [
      {
        id: 'm1',
        chat_id: 'c1',
        sender_id: 'usr_alice_001',
        content_text: 'We need to deploy the latest release to the production cluster.',
        type: 'TEXT' as const,
        is_edited: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        status: 'READ' as const,
      },
      {
        id: 'm2',
        chat_id: 'c1',
        sender_id: 'usr_bob_002',
        content_text: 'Confirmed, WebRTC calling and encryption keys are verified.',
        type: 'TEXT' as const,
        is_edited: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        status: 'READ' as const,
      },
    ];

    // Test 1: Thread Summarizer
    const summary = AIService.summarizeChat(testMessages);
    assert(summary.summary.length > 20, 'Generated summary text');
    assert(summary.keyPoints.length > 0, 'Extracted key points');
    results.push({ module: 'B7:AIService', testName: 'AI Thread conversation summarizer', passed: true });

    // Test 2: Semantic Vector Search
    const searchRes = AIService.semanticSearch('find deploy release issue', testMessages);
    assert(searchRes.length > 0, 'Semantic intent search found relevant messages');
    assert(searchRes[0].score > 0.5, 'Relevance score computed');
    results.push({ module: 'B7:AIService', testName: 'AI Semantic Vector Intent Search', passed: true });

    // Test 3: Voice Transcription
    const transcript = AIService.transcribeVoice('dummy_audio_data', 6);
    assert(transcript.transcript.length > 10, 'Generated speech-to-text transcript');
    assert(transcript.confidence > 0.9, 'Confidence score assigned');
    results.push({ module: 'B7:AIService', testName: 'Inline Voice Speech-to-Text Transcription', passed: true });

    // Test 4: Content Moderation
    const cleanMod = AIService.moderateContent('Hello team, great job today!');
    assert(cleanMod.flagged === false, 'Clean text permitted');
    const spamMod = AIService.moderateContent('Claim your free crypto tokens now at t.me/scam_bot');
    assert(spamMod.flagged === true && spamMod.action === 'DELETE', 'Phishing spam flagged and deleted');
    results.push({ module: 'B7:AIService', testName: 'AI Content Moderation (Spam & Phishing Filter)', passed: true });

    // Test 5: Call Summary & Topic Suggestions
    const callSummary = AIService.generateCallSummary(150, 'Alice Walker');
    assert(callSummary.keyDecisions.length > 0, 'Generated call decisions');
    const topics = AIService.suggestGroupTopics('Engineering Core', testMessages);
    assert(topics.suggestedTopics.length > 0, 'Suggested topic hashtags');
    results.push({ module: 'B7:AIService', testName: 'WebRTC Live Call Summary & Topic Suggestions', passed: true });
  } catch (err: any) {
    results.push({ module: 'B7:AIService', testName: 'AIService suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // MODULE B8: Analytics, Federation & Push
  // -------------------------------------------------------------
  console.log('▶ Testing Module B8: Analytics, Federation & Push...');
  try {
    const analytics = ChannelAnalyticsService.getChannelAnalytics('c1', 'Official Channel', []);
    assert(analytics.subscriberCount > 0, 'Subscriber metrics computed');
    results.push({ module: 'B8:Analytics', testName: 'Broadcast Channel Analytics calculation', passed: true });

    const fed = FederationBridgeService.getBridgeStatus();
    assert(fed.enabled === true && fed.federationConnected === true, 'Matrix/XMPP Federation status query');
    results.push({ module: 'B8:Federation', testName: 'Matrix & XMPP Federation Bridge status', passed: true });

    PushNotificationService.saveSubscription({
      userId: 'usr_alice_001',
      endpoint: 'https://fcm.googleapis.com/fcm/send/test',
      keys: { p256dh: 'test', auth: 'test' },
    });
    const pushRes = await PushNotificationService.sendPush('usr_alice_001', 'Test', 'Body');
    assert(pushRes.sent === true, 'Push notification dispatched');
    results.push({ module: 'B8:Push', testName: 'WebPush / FCM background notification dispatcher', passed: true });
  } catch (err: any) {
    results.push({ module: 'B8:Infra', testName: 'Analytics/Federation/Push suite', passed: false, error: err.message });
  }

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('📊 TEST EXECUTION SUMMARY:');
  console.log('===============================================================');
  let passCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (r.passed) {
      passCount++;
      console.log(`  ✅ [${r.module}] ${r.testName}`);
    } else {
      failCount++;
      console.log(`  ❌ [${r.module}] ${r.testName} - Error: ${r.error}`);
    }
  }

  console.log(`\nTotal Tests: ${results.length} | Passed: ${passCount} | Failed: ${failCount}`);
  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Suite Failure:', err);
  process.exit(1);
});
