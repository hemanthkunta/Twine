# Aether Messaging Platform — Technical Audit vs Telegram-Like Blueprint

**Generated:** 2026-10-14  
**Scope:** Full codebase review against `telegram-like-app-blueprint.md`  
**Method:** Source inspection + QA_REPORT.md + TODO.md + live test results  

---

## 1. Feature-by-Feature Implementation Matrix

| Blueprint Area | Feature | Status | Evidence / Gaps |
|---|---|---|---|
| **Auth & Identity** | Phone OTP signup | ✅ Implemented | `/auth/request-otp`, `/auth/verify-otp`, OTPService (single-use, cooldown, 5-min expiry). Dev codes echoed; no SMS provider. |
| | Password auth | ✅ Implemented | `/auth/register`, `/auth/login` with bcrypt (cost 12). |
| | 2FA (cloud password) | ❌ Missing | Columns exist (`totp_secret`, `backup_codes`, `twofa_enabled_at`), routes stubbed with limiters, **but no TOTP generation/verification logic**. |
| | QR code login | ❌ Missing | Client has simulated QR only; no WS key-exchange endpoint. |
| | Session mgmt | ✅ Implemented | GET `/users/sessions`, POST `/users/sessions/:id/revoke`, WS closes revoked (4001). `/auth/logout` restored 2026-10-04. |
| **Users & Contacts** | Profile (name, username, bio) | ✅ Implemented | PUT `/users/profile` with uniqueness check; avatar upload UI done 2026-10-08. |
| | Phone privacy controls | ❌ Missing | No granular privacy settings (who sees phone/photo/last-seen). |
| | Username search | ✅ Implemented | GET `/users/search?q=`, `NewChatModal.tsx`. |
| | Block/report | ✅ Implemented | `block.service.ts`, checked in send path (`messageHandler.ts:63`). |
| **Chat Types** | 1:1 Direct | ✅ Implemented | `ChatType.DIRECT`, `getOrCreateDirectChat`. |
| | Groups | ✅ Implemented | `ChatType.GROUP`, basic GroupService. |
| | Supergroups (100k+) | ❌ Missing | No admin hierarchy, no large-group optimizations. |
| | Channels | ✅ Implemented | `ChatType.CHANNEL`, `channel.service.ts`, broadcast-only, subscribers can't reply. |
| | Bots | ❌ Missing | `ai.service.ts` placeholder; no Bot API webhook/long-poll. |
| **Messaging** | Rich text (bold, italic, code, spoilers, links) | ✅ Implemented | Client rendering; link previews via `LinkPreviewService`. |
| | Media: photos | ✅ Implemented | `/media/upload` → `/uploads` static mount. |
| | Media: videos, voice, video notes, files | ⚠️ Partial | Upload path exists; **no chunked/resumable, no transcoding, no CDN**. |
| | Media: GIFs, stickers, location | ❌ Missing | Polls ✅ (2026-10-03). |
| | Edit / Delete (for me / everyone) | ✅ Implemented | `editMessage`, `deleteMessage` with auth checks. |
| | Forward (with/without attribution) | ✅ Implemented | `MessageService.forwardMessage` (100-target cap, 500-recipient cap). |
| | Reply/quote, pin, react | ✅ Implemented | `reply_to_message_id`, `pinned_messages`, `message_reactions` tables. |
| | Thread/comment views | ❌ Missing | Especially for channels. |
| | Read receipts (sent→delivered→read) | ✅ Implemented | `message_receipts` table, `chat:receipt_update` WS frame. |
| | Typing indicators | ✅ Implemented | `chat:user_typing` broadcast, animated pulse waves. |
| | Search (in-chat + global) | ✅ Implemented | GET `/messages/search` (LIKE), `/ai/semantic-search`. **True FTS5 DONE 2026-10-08**: `messages_fts` virtual table + triggers, MATCH with token quoting. |
| | Drafts (cross-device) | ✅ Implemented | `chat_drafts` table, PUT `/chats/:id/draft`. |
| | Scheduled messages | ❌ Missing | `scheduled_messages` table + sweep exists (2026-10-13) but **no API/route**. |
| | Disappearing messages | ⚠️ Client-only | `DisappearingTimerModal.tsx` + localStorage timers; **no `expires_at`, no server TTL enforcement/sweep**. |
| **Media Handling** | Client compression | ✅ Implemented | Configurable quality before upload. |
| | Chunked/resumable uploads | ❌ Missing | Single-request base64 only. |
| | Server transcoding (adaptive bitrate) | ❌ Missing | No FFmpeg pipeline. |
| | CDN delivery | ❌ Missing | Local `/uploads` only. |
| | Sticker/GIF marketplace | ❌ Missing | |
| **Presence & Notifications** | Online/offline/last-seen | ✅ Implemented | `PresenceService`, `presence:update` broadcast, `device_sync_state`. |
| | Push (FCM/APNs/Web) | ✅ Implemented | `push.service.ts` with VAPID. |
| | Encrypted push (silent + fetch) | ❌ Missing | Payloads not encrypted; provider sees content. |
| | Per-chat mute | ✅ Implemented | `chat_members.is_muted`, POST `/chats/:id/mute\|unmute`. |
| | Custom sounds / mention-only | ❌ Missing | |
| **Voice/Video Calls** | 1:1 WebRTC | ✅ Implemented | `CallModal.tsx`, `WebRTCManager`, screen sharing (track replacement + SDP renegotiation). |
| | P2P + TURN/STUN relay | ⚠️ Partial | Only Google STUN configured (`turn.service.ts`); **no coturn/TURN**, calls fail behind symmetric NAT. |
| | Group calls (SFU) | ❌ Missing | No mediasoup/Janus/LiveKit. |
| **Groups/Channels Admin** | Role-based permissions | ⚠️ Partial | `chat_members.role` + `permissions_bitmask` columns exist; **not enforced in routes**. |
| | Slow mode | ❌ Missing | |
| | Invite links (expiry, approval) | ❌ Missing | |
| | Content moderation (report, auto-flag, spam) | ⚠️ Partial | `block.service.ts` only; no auto-flag/spam detection. |
| **Security** | TLS in transit | ✅ Implemented | HTTPS/WSS in prod; dev uses HTTP/WS. |
| | Encryption at rest | ⚠️ Partial | SQLite file; no transparent encryption. |
| | **E2E encryption (default)** | ❌ Missing | **Critical gap**: `ciphertext_payload` field exists, key directory (`identity_keys`, `signed_prekeys`, `one_time_prekeys`) built, **but send/receive path does NOT seal/open**. `E2EEService.sealForChat` returns `null` → plaintext. Group sender keys (`group_sender_keys`) table built; `e2eeGroup.service.ts` imported but `decryptGroupMessage` never advances chain key. |
| | Safety numbers | ⚠️ Partial | Fingerprints computed from real pubkeys; "Mark as Verified" is bare `localStorage.setItem`. |
| | Screenshot detection | ❌ Missing | Only catches `PrintScreen` keydown; no peer/server notification. |
| | Self-destruct timers (secret chats) | ❌ Missing | |
| | Local app passcode/biometric | ❌ Missing | |
| **Sync & Backup** | Multi-device real-time sync | ✅ Implemented | `device_sync_state` per-device cursor; `chat:message_ack`, `chat:receipt_update` fan-out to all devices. |
| | Chat export/backup | ❌ Missing | |
| **Extensibility** | Bot API (webhook/long-poll) | ❌ Missing | `federation.service.ts` placeholder only. |
| | Mini Apps / embedded web apps | ❌ Missing | |

---

## 2. Critical Bugs & Security Risks (with Evidence)

| # | Severity | Issue | File / Location | Evidence |
|---|---|---|---|---|
| 1 | **P0** | **Media served without auth** | `server.ts:51-59` mounts `express.static('/uploads')` | Anyone with filename reads any chat's media; `/media/:filename` membership check bypassable. |
| 2 | **P0** | **No E2E encryption in send/receive path** | `client/src/services/e2ee.ts:128-170`, `messageHandler.ts:79-88` | `sealForChat` returns `null`; messages stored/sent as plaintext despite `ciphertext_payload` column and key directory. |
| 3 | **P0** | **Metrics endpoint unauthenticated** | `routes.ts:941` | `GET /api/metrics` exposes heap, event-loop lag, route counts to anyone. |
| 4 | **P1** | **SSRF in link previews** | `LinkPreviewService.isValidUrl` | Accepts private/link-local/loopback; no IP pinning. |
| 5 | **P1** | **WebSocket fan-out is single-process** | `clusterBroker` imported but unused | Multi-replica deploy silently drops cross-pod delivery. |
| 6 | **P1** | **CORS `origin: '*'` with `credentials: true`** | `server.ts` (not shown but flagged in QA) | Should honor `config.corsOrigin`. |
| 7 | **P1** | **No request-body schema validation** | Ad-hoc `if (!field)` checks only | Injection/DoS surface. |
| 8 | **P1** | **In-memory OTP store not multi-instance safe** | `otp.service.ts:169` Map | Won't work behind load balancer. |
| 9 | **P2** | **Client doesn't call refresh-token rotation** | `ws.ts` handles 4001 but never calls `/auth/refresh` | Expired access token leaves client stuck. |
| 10 | **P2** | **Polls lost on restart** | In-memory `Map` in `ai.service.ts` | QA_REPORT #41. |
| 11 | **P2** | **Transient socket reset (~1/8 E2E runs)** | `test-twine.spec.js` | `net::ERR_CONNECTION_CLOSED` on send; message lost, no backend error. Root cause undiagnosed. |
| 12 | **P2** | **QR login simulated only** | Client QR UI exists; no WS key-exchange endpoint | User-trust liability (TODO #34). |

---

## 3. Top 5 Highest-Priority Improvements

1. **Authenticate `/uploads` media delivery** — Stream through membership-checked handler or signed URLs (fixes P0 #1).
2. **Wire E2E encryption end-to-end** — On login: publish identity key; on send: lookup peer key → `sealForPeer` → `ciphertext_payload`; on receive: `decryptIncoming` with plaintext fallback (unblocks #2, #30, #31 in TODO).
3. **Fix SSRF + harden link previews** — Private IP rejection, DNS pinning, timeout/budget (fixes #4).
4. **Enable multi-node fan-out** — Wire `clusterBroker` (Redis pub/sub or NATS) for presence + broadcast + rate-limiter sync (fixes #5).
5. **Implement 2FA (TOTP + backup codes)** — Columns/routes exist; add `otplib` + QR generation + verification flow (closes TODO #12, #13).

---

## 4. Phased Implementation Plan (Preserves Existing Functionality)

### Phase A — Security Hardening (1–2 weeks)
| Task | Files to Touch | Validation |
|---|---|---|
| A1. Move `/uploads` behind authenticated handler | `server.ts`, `routes.ts` (new `/media/:filename` with membership check), remove static mount | `curl /uploads/...` → 401; member `GET /media/...` → 200 |
| A2. Add SSRF protection to `LinkPreviewService` | `LinkPreviewService.ts` | Unit tests: private IPs → reject; public → fetch OK |
| A3. Protect `/api/metrics` with auth middleware | `routes.ts` | Unauthed → 419; authed → 200 |
| A4. Fix CORS to use `config.corsOrigin` | `server.ts` | Browser preflight check |

### Phase B — E2E Encryption (3–4 weeks)
| Task | Files to Touch | Validation |
|---|---|---|
| B1. Call `E2EEService.ensureIdentityPublished` on WS auth handshake | `authHandler.ts`, `ws.ts` | Key visible in `identity_keys` table |
| B2. In `handleSendMessage`: for E2EE chats, `sealForChat` → `ciphertext_payload` | `messageHandler.ts:79-88` | Sent message has `ciphertext_payload`; recipient decrypts |
| B3. In `formatMessageRow` / client `decryptIncoming`: open `ciphertext_payload` | `message.service.ts`, `e2ee.ts` | UI shows plaintext; sealed messages show placeholder until key available |
| B4. Group sender-key ratchet: advance chain key on each send/recv | `e2eeGroup.service.ts`, `SenderKeyService` | Multi-member group decrypts each other's messages |
| B5. Safety-number binding to real keys + peer verification UI | `e2ee.ts`, `ChatHeader.tsx` | Both sides show matching fingerprint |

### Phase C — Scale & Reliability (2–3 weeks)
| Task | Files to Touch | Validation |
|---|---|---|
| C1. Wire `clusterBroker` for presence + broadcast + rate-limiter | `cluster.service.ts`, `presence.service.ts`, `rateLimiter.ts` | Two backend replicas: user on pod A → message delivered to user on pod B |
| C2. Replace in-memory OTP store with Redis | `otp.service.ts`, `config/index.ts` | Two pods: OTP requested on pod A → verified on pod B |
| C3. Client refresh-token rotation on 419/401 | `ws.ts`, `api.ts` | Expired token → auto-refresh → reconnect → continue |
| C4. Persist polls to SQLite (already have tables) | `ai.service.ts`, `polls` tables | Restart backend → polls survive |

### Phase D — Missing Blueprint Features (ongoing)
| Feature | Est. Effort | Dependencies |
|---|---|---|
| 2FA (TOTP + backup codes) | 1 week | Phase A done |
| QR code device login | 1 week | E2E key exchange (Phase B) |
| Chunked/resumable uploads | 2 weeks | Media service refactor |
| Scheduled messages API | 3 days | `scheduled_messages` table exists |
| Server-side disappearing TTL | 3 days | `expires_at` column + sweep exists |
| Supergroups / admin hierarchy | 3 weeks | Role enforcement in routes |
| Bot API (webhook/long-poll) | 2 weeks | Extensibility layer |
| Push payload encryption | 1 week | VAPID + client decrypt |

---

## 5. Tests Required to Validate Each Change

| Phase | Test Type | Specific Cases |
|---|---|---|
| **A** | Unit | `LinkPreviewService.isValidUrl` rejects `10.x`, `127.0.0.1`, `169.254.x` |
| | Integration | `GET /media/<file>` → 401 without token; 200 with token + membership |
| | Security | `GET /api/metrics` → 419 unauthed; 200 authed |
| **B** | Unit | `CryptoService.sealForPeer`/`openFromPeer` round-trip with generated keys |
| | Integration | Alice→Bob 1:1: message stored with `ciphertext_payload`; Bob decrypts; Charlie (non-member) cannot |
| | Integration | Group of 3: each member decrypts others' messages; new member gets history via sender keys |
| | E2E (Playwright) | Two browsers: send encrypted message → recipient renders plaintext; reload → still decrypts |
| | Regression | Existing non-E2EE chats still work (plaintext path unchanged) |
| **C** | Integration | Spin 2 backend pods (docker-compose); send message from pod A user → pod B user receives |
| | Load | 10k concurrent WS connections across 3 pods; presence + broadcast latency < 100 ms p99 |
| | Chaos | Kill one pod mid-session; clients on that pod reconnect to survivor; no message loss |
| **D** | Unit | 2FA: `enable2FA` → QR scans in Google Authenticator → `verify2FAToken` passes; backup codes work once |
| | Integration | Scheduled message at T+5s → delivered at T+5s ±1s; disappears at `expires_at` |

---

## 6. Concise Recommendation — Safest Next Development Task

> **Start with Phase A, Task A1: Authenticate `/uploads` media delivery.**  
> It is a single, well-scoped fix (≈20 lines), eliminates the last P0 data-exfiltration risk, requires no schema changes, and can be validated with a one-line `curl`. All other high-priority work (E2E, clustering, 2FA) depends on a trustworthy security baseline.

**Suggested commit sequence:**
1. Add `GET /media/:filename` with `authMiddleware` + `ChatService.isChatMember` check (reuse `MediaService.getMediaUrl` logic).
2. Remove `app.use('/uploads', express.static(...))` from `server.ts`.
3. Update client `ApiService.getMediaUrl` to hit the new authenticated route (already does).
4. Run `npm run test:security` (should stay 11/11) + manual `curl` verification.