# TODO: Telegram-like Messaging Platform Completion Checklist

Based on analysis against 	elegram-like-app-blueprint.md and QA_REPORT verification.  
Use this checklist to track implementation progress.

## 📁 Architecture & Protocol Layer

### 1.1 Client-Server Model
- [x] Cloud-based architecture with multi-device sync
- [x] Connection registry & multi-device pooling (per README)
- [x] Phone-number based signup with OTP (SMS/voice verification) — **Backend complete (OTPService single-use codes, /auth/request-otp, /auth/verify-otp) + frontend "Phone OTP" login tab in AuthModal (request code, 6-digit verify, resend w/ countdown); SMS provider still pending (dev codes log to server console)**
- [ ] Two-factor authentication (2FA: additional cloud password)
- [ ] QR code login for device authorization
- [x] Session management (verified 2026-10-03: GET /users/sessions lists active sessions, POST /users/sessions/:id/revoke revokes + notifies via auth:session_revoked, WS closes revoked sessions with 4001; auth.service.ts:561-599, authHandler.ts:40-47). /auth/logout RESTORED (2026-10-04): POST /auth/logout re-added to live routes.ts (revokes caller's session via embedded session_id + emits auth:session_revoked); curl-verified — logout returns {success:true} and the token then gets 419

### 1.2 Protocol Layer
- [x] WebSocket protocol over TLS (sequenced JSON frames: seq, type, payload, correlation_id, timestamp)
- [ ] MTProto-style optimization (not required; WebSockets acceptable per blueprint)
- [x] Heartbeat / keepalive mechanism
- [x] Optimistic UI with message acknowledgments (chat:message_ack)

### 1.3 Data Flow
- [x] Message persistence to database + message queue
- [x] Queue fans messages to: online devices via WebSocket, push service for offline, search indexing
- [x] Read receipts/delivery status flow reverse path
- [x] Global full-text search implementation — **Implemented (verified 2026-10-03): GET /messages/search with optional chatId (omitting it searches all the user's chats; SQL LIKE, not true FTS); routes.ts:441-455, message.service.ts:395-458**
- [x] Semantic search (AI-powered) capability — **Implemented (verified 2026-10-03): POST /ai/semantic-search with chatId scope + membership check (routes.ts:650-672); client GlobalSearchModal.tsx dual-mode (keyword + AI semantic)**

### 1.4 Data Center Design
- [ ] Multi-region deployment with primary-region-per-user sharding
- [ ] Latency-optimized data routing
- [ ] Redundancy across data centers

## 👥 Core Feature Set

### 2.1 Authentication & Identity
- [x] Demo account switching (1-click multi-account tester: Alice/Bob/Charlie/Diana)
- [x] Phone-number based signup with OTP (SMS/voice) — **Backend + AuthModal OTP login UI complete; SMS provider integration pending (dev: console log)**
- [ ] Two-factor authentication (2FA: additional cloud password)
- [x] Session management: view/remotely log out active sessions per device (GET /users/sessions + POST /users/sessions/:id/revoke; verified 2026-10-03)
- [ ] QR code login: scan to log in new device without retyping credentials

### 2.2 Users & Contacts
- [~] Profile management: name, username (unique handle), bio (PUT /users/profile with username-uniqueness check; routes.ts:262-275, auth.service.ts:334-381 — verified 2026-10-03); **profile photo upload UI DONE (2026-10-08): SettingsModal "Change photo" → POST /media/upload → PUT /users/profile {avatarUrl}, UserAvatar resolves protected /uploads URLs via token-authenticated fetch**
- [ ] Phone number with privacy controls (who can see it)
- [~] In-app search by username/name/phone (implemented: GET /users/search?q= routes.ts, NewChatModal.tsx — verified 2026-10-03); contact sync (optional, with consent) not implemented
- [x] Blocking/reporting users (lock.service.ts)
- [ ] Privacy settings granularity: who can see last seen, profile photo, phone number, add to groups, call you

### 2.3 Chat Types
- [x] Private (1:1) chats
- [x] Groups: small, all members visible, everyone can typically message
- [ ] Supergroups: large-scale groups (100k+ members), admin hierarchy, moderation tools
- [x] Channels: broadcast-only, one-to-many, subscribers can't reply in main feed
- [ ] Bots: automated accounts driven by API (optional but powerful)

### 2.4 Messaging Features
- [x] Rich text formatting: bold, italic, code blocks, spoilers, links with previews
- [x] Media messages: photos supported (uploads folder)
- [x] Media messages: videos, voice notes, video notes (round "video messages"), documents/files
- [~] Media messages: GIFs, stickers, location sharing (live location too) — **POLLS ARE DONE (verified 2026-10-03): polls/poll_options/poll_votes SQLite tables, createPoll/votePoll with membership check, POST /polls/create + /polls/vote (routes.ts:722,761), PollCard.tsx + CreatePollModal.tsx UI**
- [x] Message actions: edit, delete (for me / for everyone)
- [x] Message actions: forward (with/without attribution) — **DONE (2026-10-08): messages.forwarded_from_message_id/forwarded_from_sender_id, MessageService.forwardMessage with membership validation (100-target cap), POST /messages/forward, forwardedFrom payload on all message mappers + WS chat:new_message fanout identical to normal sends; client ForwardMessageModal (multi-chat picker + "Hide sender name") + "Forwarded from X" bubble header; npm run test:forward 12/12**
- [x] Message actions: reply/quote, pin, react with emoji
- [ ] Message actions: thread/comment views (especially for channels)
- [x] Read receipts & delivery status: sent → delivered → read (shown per-message)
- [x] Typing indicators: "X is typing…" with animated pulse waves
- [x] Message search: in-chat (chatId param on /messages/search) and global search across all chats; client GlobalSearchModal (keyword + AI semantic) — **TRUE FTS DONE (2026-10-08): SQLite FTS5 messages_fts mirror table with insert/update/delete triggers + idempotent backfill migration (schema.ts SCHEMA_SQL + SCHEMA_MIGRATIONS); searchMessages uses MATCH with per-token quoting + OR, LIKE fallback on error; same route/response shape**
- [x] Drafts: unsent message text saved per chat across devices
- [ ] Scheduled messages
- [~] Self-destructing/disappearing messages: client-side only (DisappearingTimerModal.tsx TTL picker, disappearing.service.ts localStorage timers, auto-removal in App.tsx) — no backend support: no expires_at/ttl column, no TTL enforcement or sweep (verified 2026-10-03)

### 2.5 Media Handling
- [x] Client-side compression before upload (configurable quality)
- [ ] Chunked/resumable uploads for large files (Telegram: up to 2–4GB per file for Premium)
- [ ] Server-side transcoding for video streaming (adaptive bitrate for playback before full download)
- [ ] CDN-backed media delivery for global speed
- [ ] Sticker & GIF search/marketplace

### 2.6 Presence & Notifications
- [x] Online/offline/last-seen status
- [x] Push notifications: push.service.ts (FCM/APNs/Web Push)
- [ ] Encrypted push notifications: encrypt payloads, use silent pushes + fetch (provider sees no content)
- [~] Per-chat notification muting (implemented: POST /chats/:id/mute|unmute, chat_members.is_muted, ChatHeader toggle — verified 2026-10-03); custom sounds and mention-only alerts still missing

### 2.7 Voice & Video Calls
- [x] 1:1 calls using WebRTC (CallModal.tsx, WebRTCManager)
- [ ] Peer-to-peer when possible (relayed via TURN/STUN servers otherwise)
- [ ] Group calls / "live" video conferencing (requires SFU: mediasoup, Janus, LiveKit)
- [x] Screen sharing (WebRTCManager.tsx toggleScreenShare with track replacement + SDP renegotiation, remote screen main-stage view — verified 2026-10-03; note: active call UI is WebRTCManager.tsx, CallModal.tsx is unused)

### 2.8 Groups/Channels Administration
- [ ] Role-based permissions: owner, admins, moderators, members with granular rights
- [ ] Slow mode: rate-limit messages per user
- [ ] Invite links: with expiry, usage limits, join requests requiring admin approval
- [x] Content moderation tools: report message, auto-flagging for banned content, spam detection

### 2.9 Security
- [x] Encryption in transit: TLS and at rest for cloud chats
- [ ] True end-to-end encryption: for secret/private-mode chats (Signal Protocol or similar)
- [ ] End-to-end encryption by DEFAULT for all chats (not opt-in "secret chat" mode)
- [ ] Screenshot detection/notification in secret chats
- [ ] Self-destruct timers on secret chat content
- [ ] Local app passcode/biometric lock

### 2.10 Sync & Backup
- [x] Multi-device real-time sync: message state, read status, settings (for cloud chats)
- [ ] Chat export/backup tools

### 2.11 Extensibility
- [ ] Bot API: HTTP webhook or long-polling based for third-party automations
- [ ] Optional public API: for Mini Apps / embedded web apps inside chats

## 🚀 Advanced Features (To Go Beyond Telegram)

### 3.1 Privacy & Security Enhancements
- [ ] E2E encryption by default for all chats (not just opt-in secret chats)
- [ ] AI-native features: on-device/privacy-preserving message summarization, smart reply suggestions
- [ ] Real-time translation inline in chat
- [ ] AI-powered semantic search ("find that message about the invoice from last month")
- [ ] Decentralization option: self-hosted/federated servers (like Matrix) alongside hosted cloud
- [ ] Metadata minimization: sealed sender techniques, minimal logging, private contact discovery
- [ ] Built-in collaboration tools: shared documents/whiteboards, live co-editing, task/checklist objects in chat
- [ ] P2P large-file transfer: WebRTC data channels to bypass server storage for huge files
- [ ] Granular org/enterprise controls: audit logs, retention policies, DLP integrations
- [ ] Plugin/extension architecture: custom message types, mini-apps, integrations beyond bots
- [ ] Cross-platform encrypted cloud sync: encrypted blob sync model (server cannot read content)

## 🛠️ Recommended Tech Stack Alignment

### Current Stack (Partial Alignment)
- [x] Backend: Node.js/TypeScript (acceptable alternative to Go/Elixir/Rust per blueprint)
- [x] Real-time transport: WebSockets over TLS (blueprint's #1 recommendation)
- [x] Primary database: SQLite (dev) → scalable to PostgreSQL (blueprint recommendation)
- [~] Cache/presence: Redis implied via ioredis in dependencies (environment uses in-memory fallback)
- [x] Message queue: Redis pubsub or similar (scalable to Kafka/NATS)
- [~] Object/media storage: Local uploads → S3-compatible + CDN ready (but #4: media served without authorization requires fix)
- [x] Media transcoding: FFmpeg pipeline not local but architecturally separable
- [x] Calls: WebRTC + TURN/STUN (	urn.service.ts exists); SFU needed for group calls
- [x] E2E encryption: Protocol-ready via ciphertext_payload field (Signal Protocol/MLS implementable)
- [x] Push notifications: FCM/APNs via push.service.ts
- [~] Mobile client: Expo/React Native (SDK 57) scaffolded — auth, chat list, chat, settings screens; API + WebSocket clients wired
- [x] Web client: Next.js/equivalent (using Vite/React)
- [ ] Infra: Docker/K8s ready in structure but not implemented
- [ ] Search: Basic implementation → scalable to Elasticsearch/OpenSearch or Meilisearch

## 🗺️ Development Roadmap Progress

### Phase 1 — MVP (Auth + 1:1 Text Chat)
- [x] Auth: demo account switching (phone/email+OTP: backend ready, no SMS provider, no OTP login UI)
- [x] 1:1 text chat: core functionality implemented
- [x] Basic media upload: image support implemented
- [x] WebSocket real-time delivery: fully implemented
- [x] Push notifications: push.service.ts implemented

### Phase 2 — Social Layer
- [x] Groups: basic group service implemented
- [x] Channels: fully implemented (channel.service.ts, REST routes, DB schema, frontend UI)
- [x] Presence/typing/read receipts: fully implemented
- [x] Search: in-chat + global full-text search implemented (GlobalSearchModal, /messages/search, /ai/semantic-search — verified 2026-10-03)
- [x] Message editing/deletion/forwarding: edit/delete/forward all implemented (forward added 2026-10-08, w/ or w/o attribution)

### Phase 3 — Trust & Calls
- [ ] E2E encrypted chats: protocol-ready but not default/implemented
- [x] 1:1 voice/video calls: WebRTC calling UI implemented (TURN server configuration incomplete)
- [x] Session management: view/revoke active sessions per device implemented (GET /users/sessions, POST /users/sessions/:id/revoke — verified 2026-10-03)
- [ ] Two-factor authentication (2FA): not implemented

### Phase 4 — Scale & Differentiate
- [ ] Group calls: not implemented (requires SFU)
- [ ] Admin/moderation tooling: basic via lock.service; full admin hierarchy missing
- [ ] Bot/API platform: ederation.service.ts placeholder; webhook API not implemented
- [ ] AI features: i.service.ts exists; features not implemented
- [ ] Decentralization option: not implemented

### Phase 5 — Enterprise/Advanced
- [ ] Org controls: audit logs, retention policies, DLP not implemented
- [ ] Plugin/extension architecture: not implemented
- [ ] P2P transfer: WebRTC data channels not implemented
- [ ] Compliance features: not implemented

### Mobile Client (Expo/React Native, mobile/)
- [x] Scaffold Expo SDK 57 blank-typescript app + install react-navigation, secure-store, safe-area-context
- [x] Screens: Login (demo accounts), ChatList, Chat, Settings
- [x] Components: ChatListItem, MessageBubble, MessageInput, StatusTicks, TypingIndicator, UserAvatar
- [x] AppContext reducer state (chats/messages/typing/presence/connection)
- [x] API client + resilient WebSocket client (reconnect/backoff), protocol types mirrored
- [x] Fix corrupted template literals in pi.ts/ws.ts (backticks stripped) → 	sc --noEmit clean
- [~] Backend endpoint alignment: uth:handshake (not uth:login), POST /auth/demo-login + /auth/demo-users, POST /chats/direct body 	argetUserId, POST /chats/:id/read-all, WS events chat:send_message/chat:typing (inbound chat:new_message, chat:message_ack, chat:receipt_update, chat:user_typing, presence:update)
- [ ] Verify runtime against live backend (expo start / bundle export)
- [x] New-chat modal (user search) + group chat support (mobile/src/components/NewChatModal.tsx: direct/group modes, api.searchUsers, createGroup — verified 2026-10-03)
- [ ] E2EE on mobile (Signal key exchange over WS), media upload, WebRTC calls

## ✅ TODO Accuracy Re-verification — 2026-10-03

Backend and frontend were re-audited against this checklist. Corrections applied above:
- Now checked as done: global full-text search, semantic search, in-chat search, session management (view/revoke), profile name/username/bio editing, polls, screen sharing, mobile new-chat modal, mobile group chat support.
- Now marked partial: disappearing messages (client-side only, no backend TTL), per-chat muting (mute done; custom sounds/mention-only missing), profile photo upload UI.
- RESTORED: /auth/logout route (2026-10-04) — re-added to live routes.ts at line ~297; curl-verified (success + 419 afterwards). Previously it existed only in src/http/routes.ts.backup:229.
- Confirmed still open: message forwarding, 2FA, QR login (client has only a simulated QR), scheduled messages, chunked/resumable uploads, chat export/backup, supergroup-specific behavior, full role-based permissions (channel role enforcement exists but is not wired to any route; permissions_bitmask unused).

## 📈 Estimated Completion Progress
- **Core Messaging MVP (Phase 1-2)**: ~100% complete ✅ (2026-10-08: forwarding with/without attribution + true FTS5 search + profile photo upload all shipped and verified; only remaining gaps are external-dependency items: real SMS provider for OTP)
- **Production-Ready Security & Trust (Phase 3)**: ~25% complete  
- **Extensibility & Advanced Features (Phase 4)**: ~8% complete
- **Mobile Platform Support**: ~30% (Expo app scaffolded; core chat flows written, endpoint alignment in progress)
- **Enterprise/Advanced Features (Phase 5)**: ~3% complete

## 🔴 Critical Security Fixes (P0-P1)
*Based on QA_REPORT verification - immediate attention required:*
- [x] #4: Media served without authorization (/uploads/:filename now serves with authMiddleware; no insecure static mount in server.ts)
- [x] #19: GET /api/metrics authenticated (outes.ts uses authMiddleware)
- [x] SSRF in link previews (LinkPreviewService now resolves DNS, blocks private/reserved IPs, standard ports, validates each redirect)
- [x] #207: Missing /auth/logout route for server-side session revocation — **FIXED (2026-10-04): route restored to live routes.ts (~line 297); curl-verified — POST /auth/logout returns {success:true} and the revoked token then receives 419**
- [x] clean_production_db.ts upserts with ON CONFLICT(id) DO UPDATE (no INSERT OR REPLACE cascade; idempotent seed inserts)
- [x] #39: Refresh-token rotation on client (client/src/services/api.ts)
- [x] #41: Polls persisted to SQLite (polls/poll_options/poll_votes tables; MessageService no longer uses Redis for polls)
- [ ] #42: No request-body schema validation (ad-hoc if (!field) checks)

## 🟡 High Priority Features
*Based on QA_REPORT triage order and blueprint gaps:*
- [ ] E2EE stage 2: Wire send/receive path to key management (foundations verified in §7)
- [ ] #33/#31/#36: Decide implement vs. relabel (AI copilot, safety-number verification, mesh/BLE/LoRa transport)
- [ ] #22 harness + #23b socket reset: Fix test suite bugs and transient socket reset (~1 in 8 runs)
- [ ] #20e cluster fan-out: Implement clusterBroker usage for multi-replica deployments
- [x] #20d CORS configuration: honors config.corsOrigin via cors() in server.ts
- [ ] Supergroups implementation (Channels: ✅ done)
- [ ] Role-based permissions for groups/channels administration

---
*Checklist updated based on telegram-like-app-blueprint.md analysis, QA_REPORT verification, graphify-out architectural insights, and codebase verification (2026-09-24).  
Update checkboxes as features are implemented.  
**Phase 1–2 completion pass (2026-10-08): message forwarding (service + POST /messages/forward + ForwardMessageModal UI), true FTS5 search (messages_fts + triggers + backfill, replacing SQL LIKE), profile photo upload UI (upload → avatarUrl, UserAvatar token-fetch for protected /uploads). Verified: backend tsc clean, test:schema 6/6, test:forward 12/12, test:otp 24/24, test:comprehensive 30/30, live test:phase1 30/30, live forward/FTS HTTP checks 11/11, client tsc + build clean. Fixed pre-existing blocker: idx_messages_expires in SCHEMA_SQL aborted schema exec on old DBs (moved to SCHEMA_MIGRATIONS).**  
Critical security fixes (#4, #19, SSRF) are done; /auth/logout restored 2026-10-04. Remaining critical priorities: none blocking Phases 1-3.  
Focus on high-impact items: E2E by default, group/channel completion, media handling completion, mobile client, bot/API platform.*

## ✅ Phase 1 (Core MVP) — verified 2026-09-26

Phase 1 = Auth (phone/OTP), 1:1 chat, real-time WebSocket delivery, media.
All three pillars now run end to end against the real HTTP + WS stack.

### Blockers fixed to make Phase 1 actually work
- **Infinite recursion hung the server.** `ChatService.getChatById()` called
  `getSafetyNumber()`, which called `getChatById()` again. The unbounded async
  recursion starved the microtask queue, so *every* chat list load, chat open and
  1:1 chat creation stopped responding and no timer could ever fire. The safety
  number is now computed from an explicitly passed chat shape
  (`ChatService.calculateSafetyNumber`).
- **Backend did not compile.** `src/http/routes.ts` was missing `await` on the
  now-async service methods (`getUserChats`, `getOrCreateDirectChat`,
  `getChatMessages`, `getMessageById`, `getThreadMessages`, `searchMessages`,
  `createGroup`, `createPoll`, `votePoll`), so `GET /chats`, `POST /chats/direct`
  and `GET /chats/:id/messages` returned empty/pending objects at runtime.
- **Uploaded media could never be fetched.** `POST /media/upload` returns
  `/uploads/<file>` and the client requests exactly that URL, but only the legacy
  `/media/:filename` route existed — every image and voice note 404'd. Both paths
  now share one authenticated, membership-checked handler (`serveMediaFile`).
- **Receipts were stale.** `chat:new_message` was broadcast before delivery was
  recorded, so peers saw `SENT`; the DELIVERED receipt also only reached the one
  sending socket rather than every device of the sender.

### Auth hardening
- OTPs are one-time use (no replay), burned after 5 wrong guesses, throttled to one
  send per 30s per number, generated with `crypto.randomInt` and compared with
  `timingSafeEqual`.
- Outside production the code is echoed as `devCode` so the flow is completable
  without an SMS provider; the echo is gated on `config.isProduction`.
- `AuthModal` gained a **Phone OTP** tab with resend countdown and dev-code autofill.

### Verification commands
| Command | Result |
|---|---|
| `cd backend && npx tsc --noEmit` | clean |
| `cd client && npx tsc --noEmit` | clean |
| `cd backend && npm run test:schema` | 6/6 |
| `cd backend && npm run test:security` | 11/11 SECURE |
| `cd backend && npm run test:comprehensive` | 30/30 |
| `cd backend && npm run test:otp` | 24/24 |
| `cd backend && npm run test:phase1` (needs a live server) | 30/30 |
| `cd backend && npm run test:e2e` (needs a live server) | passed |

### Still open in Phase 1
- No real SMS/voice provider behind `OTPService.sendOTP` (console stub).
- No 2FA, QR device login, or remote session management UI.
- Uploads are single-request base64 (no chunked/resumable transfer) and are stored
  on local disk rather than S3 + CDN.
