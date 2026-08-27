# QA_REPORT — Twine / "Aether" Messaging Platform

**Author:** Senior QA / test pass · **Date:** 2026-08-27
**Scope:** Full end-to-end analysis of the current working tree (backend + client), verified by *running* the code where possible, not just reading it.

> This report **supersedes** the static `TODO.md` (dated 2026-08-24), which is now substantially
> **stale** — much of its P0/P1 list has since been fixed (see §3). Every claim below was
> re-verified against the **current** source on 2026-08-27.

---

## Legend

**Evidence tags**
- `[EXECUTED]` — I ran the code and observed this behaviour directly.
- `[VERIFIED]` — confirmed by reading the current source at the cited `file:line`.
- `[CORROBORATED]` — independently found by two review passes.

**Severity**
- **P0** Critical — exploitable now, or the app does not run.
- **P1** High — security hole or correctness bug in a core flow.
- **P2** Medium — robustness, resource, or moderate security issue.
- **P3** Test/QA infrastructure.
- **P4** Build / deploy / hygiene / performance.

---

## 1. Environment & method

- **Node** v26.5.0, deps installed for root, `backend/`, and `client/`.
- **Sandbox limitation:** this environment **blocks all TCP `listen()`** (even loopback — verified
  `EPERM`). The live HTTP/WebSocket server therefore could not be started here, so the **network
  E2E suite (`e2e_test.ts`), `cross_platform_sync_suite.ts`, live WebSocket flows, and the browser
  UI could not be exercised**. These need a normal machine and are flagged **[NEEDS LIVE RUN]**.
- **Compensation:** the service layer was driven **in-process** against a throwaway SQLite DB
  (`node:sqlite` works on Node 26 with no flag), plus full build/type-check and static audit of
  every source file and the git diff.

### Reproduce the checks I ran
```bash
# from Twine/
npm run build                    # backend tsc + client vite build  → PASS (bundle 383 kB)
cd backend && npx tsc --noEmit   # backend type-check               → PASS
cd ../client && npx tsc --noEmit # client type-check                → PASS
# in-process suites (fresh DB each):
cd ../backend
DB_PATH="$TMPDIR/a.db" node dist/test/security_audit_suite.js   # CRASHES mid-run (see #21)
DB_PATH="$TMPDIR/b.db" node dist/test/comprehensive_suite.js    # 9 pass / 5 fail (see #22)
```

---

## 2. Executive summary

Overall the backend is in **much better shape than `TODO.md` implies** — HTTP authorization, the
login fail-open, session revocation (HTTP), path traversal, media validation, and rate-limiter
eviction are genuinely fixed. The dominant risks now are:

1. **🔴 The committed HEAD does not run for media** — `MessageArea` calls `ApiService.getMediaUrl`,
   which only exists in the **uncommitted, unstaged** changes. The last commit is broken; the fix
   is sitting in the working tree. **(#1)**
2. **🔴 `POST /auth/demo-login` is an open account-takeover** — unauthenticated, un-throttled,
   mints a valid token for any user id, and `/auth/demo-users` lists every id. **(#2)**
3. **🔴 Media is served with no auth** — the new `/uploads` static mount bypasses the carefully
   gated media route entirely. **(#4)**
4. **Security honesty gap** — E2EE, mesh/BLE/LoRa, multi-device linking, AI, and the APK download
   are presented to users as real but are simulated/cosmetic. **(#30–#36)**

Counts: **P0 ×3, P1 ×8, P2 ×11, P3 ×3, P4 ×7**, plus a feature backlog (§7).

---

## 3. ✅ Verified fixed since the old TODO (do not re-audit)

- **[EXECUTED]** Login fail-open is **fixed** — wrong **and** empty passwords are rejected;
  `login()` requires a stored hash + passing `bcrypt.compareSync` (`backend/src/services/auth.service.ts:224`).
- **[VERIFIED]** HTTP chat-scoped **authorization is enforced** on every read path: `GET /chats/:id/messages`
  (`routes.ts:309`), `/chats/:id/members` (`:294`), `/threads/:parentMessageId` (`:670`),
  `POST /chats/:id/read-all` (`:329`), `/channels/:chatId/analytics` (`:687`), and the history-reading
  AI routes (`/ai/summarize:459`, `/ai/smart-replies:481`, `/ai/semantic-search:518`, `/ai/suggest-topics:568`).
- **[VERIFIED]** WS `chat:send_message`, `edit`, `delete`, `typing`, `read_receipt` all enforce
  `ChatService.isChatMember` (`backend/src/ws/gateway.ts:130,257,311,395,425`).
- **[EXECUTED]** HTTP **session revocation works** — `authMiddleware` calls `isSessionValid`
  (`routes.ts:70`); a revoked session is rejected.
- **[VERIFIED]** **Media upload validation** is now solid — MIME allow-list, magic-byte checks,
  50 MB cap, server-generated filenames (`backend/src/services/media.service.ts`); path traversal on
  `/media/:filename` blocked via `path.basename` + equality (`routes.ts:382`).
- **[VERIFIED]** Rate-limiter map is **bounded** — idle buckets evicted every 60 s
  (`backend/src/middleware/rateLimiter.ts:78`).
- **[VERIFIED]** Client: credential-less **auto-login removed** (`App.tsx:147`); `isSending`
  semantics fixed; `chat:new_message` unread/refresh race fixed; message rendering is XSS-safe
  (React elements, no `dangerouslySetInnerHTML`); WebRTC & VoiceRecorder resource cleanup present.
- **[VERIFIED]** Config **fails fast** on missing `JWT_SECRET` when `NODE_ENV=production`
  (`backend/src/config/index.ts:13`) — but see **#3** for why it's inert as shipped.

---

## 4. 🔴 P0 — Critical

- [ ] **#1 — HEAD is broken for media; fix is uncommitted.** `[EXECUTED][CORROBORATED]`
  `client/src/components/MessageArea.tsx:118,246,333` call `ApiService.getMediaUrl(...)`, but that
  method **does not exist in `client/src/services/api.ts` at HEAD** (`git show HEAD:` confirmed) and
  HEAD's `server.ts` has **no `/uploads` static mount**. So on the committed code, loading any image,
  video, or voice note throws `TypeError: getMediaUrl is not a function`. The fix exists **only in the
  unstaged working tree** (`api.ts` adds `getMediaUrl`; `server.ts` adds static serving). **Action:**
  commit the working-tree `api.ts` + `server.ts` + `MessageArea.tsx` together (they must ship as a set),
  or the repo is broken for any fresh clone.

- [ ] **#2 — `POST /auth/demo-login` = open account takeover.** `[EXECUTED][VERIFIED]`
  `backend/src/http/routes.ts:165` → `auth.service.ts:278`: unauthenticated, no `NODE_ENV`/dev gate,
  **not rate-limited**, returns a valid 15-min access token + refresh token + DB session for **any**
  `userId`. `/auth/demo-users` (`routes.ts:175`, also open) enumerates every real user id first.
  **Repro:** `curl -XPOST .../api/auth/demo-login -d '{"userId":"usr_alice_001"}'` → full session.
  **Action:** gate behind a dev-only flag and strip from production builds; never expose real ids.

- [ ] **#3 — Committed JWT secret + inert prod guard.** `[VERIFIED]`
  `docker-compose.yml:12` hardcodes `JWT_SECRET=aether-production-secret-key-32chars` (anyone with the
  repo can forge tokens for a deployment). The `config/index.ts:13` fail-fast only triggers on
  `NODE_ENV==='production'`, which the compose file never sets — so the guard is dead and would fall
  back to the committed dev string (`config/index.ts:22`) if the secret were omitted. **Action:** move
  to Docker secrets / `env_file`, rotate, and set `NODE_ENV=production`.

---

## 5. 🟠 P1 — High

- [ ] **#4 — Media served with no authorization.** `[VERIFIED][CORROBORATED]`
  `backend/src/server.ts:27-28` mounts `express.static` on `/uploads` **and** `/api/uploads` with no
  auth, so the membership check on `GET /media/:filename` (`routes.ts:424`) is fully bypassable: `GET
  /uploads/<file>` with no token reads any chat's media. The authenticated route is now dead/theatre.
  **Action:** serve media through an authenticated, membership-checked handler (stream from disk after
  the check) or sign URLs; remove the redundant `/api/uploads` mount.

- [ ] **#5 — Rate limiters defined but never attached.** `[VERIFIED]`
  `routes.ts:30-31` build `apiRateLimiter` and `uploadRateLimiter` and **never use them**; only
  `authRateLimiter` is wired (register/login/refresh). `/media/upload`, all `/ai/*`, `/messages/search`,
  and the P0 `demo-login` are unthrottled → 25 MB upload floods, AI abuse, credential/id brute force.
  The `router.use` at `routes.ts:22` only records metrics despite its "300/min" comment. **Action:**
  attach `apiRateLimiter` globally and `uploadRateLimiter` to uploads.

- [ ] **#6 — WS handshake ignores session revocation.** `[EXECUTED][VERIFIED]`
  `gateway.ts:76` calls `verifyToken` but never `isSessionValid`, so a **revoked** device keeps full
  realtime access until JWT expiry (≤15 min), and open sockets are never re-validated. The ack even
  returns a **fabricated** `session_id: sess_${Date.now()}` (`gateway.ts:100`). (Confirmed in-process:
  a revoked token still passes `verifyToken`.) **Action:** call `isSessionValid` in the handshake and
  carry the real `session_id`; periodically re-check long-lived sockets.

- [ ] **#7 — Account switch does not rebind the WebSocket.** `[VERIFIED]`
  The wired switch path (`App.tsx:1147`) calls `wsClient.connect()` **without** `disconnect()`, and
  `connect()` early-returns while the old socket is OPEN (`ws.ts:23`). **Result:** after switching
  Alice→Bob, REST uses Bob's token but the live socket stays authenticated as Alice — Bob's sent
  messages are attributed to Alice and he receives none of his own realtime events. **Action:**
  `disconnect()` then reconnect on identity change; clear `pendingQueue` (see #12).

- [ ] **#8 — Cross-account data leakage via IndexedDB.** `[VERIFIED]`
  On logout and on account switch, the `aerogram_offline_db` messages store and in-memory
  `chats`/group-key state are **never cleared** (`App.tsx:787,795,1147`). The next user on the same
  browser sees the previous user's cached messages (`offlineStorage.getLocalMessages()` at `App.tsx:331`),
  especially if the server fetch 403s. **Action:** clear IndexedDB + all in-memory state on logout/switch.

- [ ] **#9 — `chat:pin_message` has no membership/admin check.** `[VERIFIED]`
  `gateway.ts:362` lets any authenticated user pin/unpin messages in **any** chat, writing
  `pinned_messages` and flipping `is_pinned` on arbitrary messages. **Action:** enforce `isChatMember`
  + role check (as `edit`/`delete` do).

- [ ] **#10 — Blocked users can still message.** `[VERIFIED]`
  `BlockService.isBlocked` is only consulted in `webrtc:call_user` (`gateway.ts:470`); the
  `chat:send_message` path never checks it, so a blocked user keeps exchanging text.
  `BlockService.isBlockedBy` (`block.service.ts:52`) is dead code. **Action:** check block status in the
  send path (both directions) and drop delivery.

- [ ] **#11 — No 401 handling / unconditional JSON parse / no timeout in the API client.** `[VERIFIED]`
  `api.ts:32-53`: `await res.json()` runs for every response (a 204 or HTML 502 throws a `SyntaxError`
  masking the real status), errors throw a generic `Error`, there's **no `AbortController`/timeout**,
  and a **401 never logs the user out** — feeding the infinite WS reconnect (#13). **Action:** handle
  status codes, parse conditionally, add a timeout, and force logout on 401.

---

## 6. 🟡 P2 — Medium / robustness

- [ ] **#12 — `ws.ts` `pendingQueue` unbounded & survives disconnect.** `[VERIFIED]` `ws.ts:13,106,153`
  — queued frames flush on the next `auth:ack`; after an account switch they can send the previous
  user's messages under the new session.
- [ ] **#13 — WS reconnect has no backoff/jitter/cap and ignores auth rejection.** `[VERIFIED]`
  `ws.ts:145` fixed 2000 ms; `:49` always reconnects → an expired token causes an infinite ~2 s
  handshake-fail→close→retry hammer loop.
- [ ] **#14 — No dedup by message id.** `[VERIFIED]` `App.tsx:403,255` append `[...prev, msg]`; a
  reconnect + refetch or an echoed ack renders duplicates.
- [ ] **#15 — No ack timeout.** `[VERIFIED]` `App.tsx:449` — a dropped ack leaves the bubble showing
  "Sending…" forever.
- [ ] **#16 — `setMessages` overwrites QUEUED outbox items.** `[VERIFIED]` `App.tsx:374` — an
  offline-composed message vanishes from the thread the moment `getMessages` resolves.
- [ ] **#17 — No message-length limit.** `[EXECUTED][CORROBORATED]` `message.service.ts:14` inserts
  `content_text` unbounded; neither WS nor route caps it. Verified in-process: a **100,000-char** body
  is stored verbatim (up to the 25 MB `express.json` limit). → storage/DoS.
- [ ] **#18 — Null `content_text` crashes handlers.** `[VERIFIED]` A media send with no caption stores
  `NULL`; `gateway.ts:183` `message.content_text.trim()` throws (spurious `INTERNAL_ERROR` after
  broadcast), and `/channels/:chatId/analytics` 500s on `m.content_text.slice(0,60)`
  (`analytics.service.ts:9`) when any of the first 5 messages lack text.
- [ ] **#19 — `/api/metrics` unauthenticated + unbounded cardinality.** `[VERIFIED]` `routes.ts:762`
  exposes heap/lag/route counts to anyone; `metrics.service.ts:19` keys on raw path, so `GET
  /api/<random>` spam grows the map without bound.
- [ ] **#20 — WebRTC reports "connected" on failure; signaling unvalidated; blank-canvas fallback.**
  `[VERIFIED]` `WebRTCManager.tsx:105,336` set `callStatus('connected')` inside `catch`, and
  `getLocalMediaStream` returns a blank `captureStream` when mic/cam denied → a green "Connected"
  call over dead media. Backend `answer`/`ice_candidate`/`hangup` forward to an arbitrary
  `target_user_id` with no call-session validation (`gateway.ts:499`) → spoofable signaling.
- [ ] **#20b — Disappearing messages are UI-only.** `[VERIFIED]` `App.tsx:416,691` only filter React
  state; the row stays in IndexedDB and reappears on reload, contradicting the modal's "Auto-Delete
  from All Devices" claim. `disappearing.service.ts:10` `messageExpiryTimers` is declared, unused.
- [ ] **#20c — Memory leaks / uncleared timers.** `[VERIFIED]` `main.tsx:45` 1 s `setInterval`
  rewriting `document.title` (never cleared); `App.tsx:418,692` disappearing `setTimeout`s (up to
  1-week) not cleared on unmount/chat switch and fire `setMessages` against unrelated state;
  `App.tsx:290` screenshot-warning timeout not cleared.
- [ ] **#20d — CORS `origin:'*'` with `credentials:true`.** `[VERIFIED]` `server.ts:17` ignores
  `config.corsOrigin`. Impact limited (Bearer, not cookies) but should honour the configured origin.
- [ ] **#20e — Multi-node fan-out is non-functional.** `[VERIFIED]` `clusterBroker` imported, never
  used (`gateway.ts:12`); presence/broadcasts are in-process only → a multi-replica deploy silently
  drops cross-pod delivery (and the rate limiter is per-instance).

---

## 7. 🧪 P3 — Test & QA infrastructure (currently broken/misleading)

- [ ] **#21 — `security_audit_suite.ts` crashes mid-run.** `[EXECUTED]` It aborts at the IDOR test
  `[3/5]` with `FOREIGN KEY constraint failed`, because `security_audit_suite.ts:94` calls
  `getOrCreateDirectChat('usr_bob_002','usr_charlie_003')` but **`usr_charlie_003` is no longer seeded**
  — the seed was cut to Alice+Bob only (`db/index.ts:219`). No summary is ever printed, so its "SECURE"
  verdicts are never actually reached. **Same broken references** in `comprehensive_suite.ts:134` (Charlie)
  and `:152` (Diana). **Action:** register test users in-suite or restore the seed; don't depend on demo ids.
- [ ] **#22 — `comprehensive_suite.ts` fails 9/5 and hides failures.** `[EXECUTED]` 5 of 14 modules fail
  with `no such table: users` because the suite **never calls `initDatabase()`**. Each module is one
  giant `try/catch`, so the first failed assert collapses a whole module into a single generic failure.
  **Action:** call `initDatabase()`; make each assertion its own test.
- [ ] **#23 — No test runner; suites orphaned; E2E needs a live server.** `[VERIFIED]` No Jest/Vitest/
  `node:test`; only `test:e2e` is wired in `backend/package.json`. `comprehensive_suite`,
  `security_audit_suite`, `cross_platform_sync_suite` are referenced by nothing. `e2e_test.ts` +
  `cross_platform_sync_suite.ts` require a running `localhost:4000` **[NEEDS LIVE RUN]** and use
  `sleep()`-based sequencing (timing-brittle). **Action:** adopt a runner, wire all suites into CI,
  replace sleeps with event-awaiting, and add a server setup/teardown fixture.

---

## 8. 🔧 P4 — Build, deploy, hygiene, performance

- [ ] **#24 — Remove leftover debug logging.** `[EXECUTED]` `media.service.ts:91` `[MEDIA DEBUG]` dumps
  mime/size/first-16-bytes of **every** upload (observed firing). Also `[VOICE]` logs
  (`VoiceRecorder.tsx:173,197,351,413`) and `[VOICE PLAYBACK]` (`MessageArea.tsx:282`).
- [ ] **#25 — Uploads path resolved inconsistently.** `[VERIFIED]` `media.service.ts:5` computes
  `UPLOADS_DIR` defensively, but `routes.ts:391` hardcodes `path.resolve('backend','uploads')` (relative
  to CWD). Run from `backend/` and the authed read route looks in `backend/backend/uploads` while writes
  go to `backend/uploads` → media 404s. **Action:** use the shared `UPLOADS_DIR` everywhere.
- [ ] **#26 — Dead code from the media refactor.** `[VERIFIED]` The authed `GET /api/media/:filename`
  route (`routes.ts:377`) is no longer called (client builds `/uploads/...` directly); `getMediaUrl`
  fallback yields a dead `/api/<file>` for bare names (`api.ts:29`); VoiceRecorder's
  `destinationRef`/`processedStreamRef` nodes are created but never connected/assigned
  (`VoiceRecorder.tsx:73,290`); its "records the processed stream" comment is now false (records raw mic).
- [ ] **#27 — MessageArea blob-URL cleanup revokes in-use URLs.** `[VERIFIED][CORROBORATED]`
  `MessageArea.tsx:173-188` keys cleanup on `[mediaUrls]` and revokes **all** blob URLs + pauses **every**
  audio element on each change — so a new incoming media message tears down a playing voice note and can
  invalidate already-rendered videos. Should be unmount-only (`[]`) or scoped to the removed URL.
- [ ] **#28 — Perf.** `[VERIFIED]` MessageArea re-`fetch`es all media on every `messages` change
  (`:106`); no `React.memo`/`useMemo`/`useCallback` anywhere; `App.tsx` (1,306 lines) re-renders on every
  presence/typing frame; smart-replies re-fetched on every incoming message; `moderateContent`
  (`App.tsx:643`) is a blocking pre-send round-trip **with no try/catch** — offline, the rejection
  silently aborts the send. Vite warns the 383 kB bundle isn't code-split.
- [ ] **#29 — Docker/CI hygiene.** `[VERIFIED]` No `USER` (runs as root), no `.dockerignore`, no
  `HEALTHCHECK` (though `checkDbHealth`/`/api/ready` exist), bare `node` as PID 1 (SIGTERM/graceful
  shutdown defeated), `npm ci --only=production` deprecated, obsolete `version:'3.8'` in compose, and
  **no CI / ESLint / Prettier / `.env.example`** anywhere.

---

## 9. 🚀 New features to implement / analyzed

### A. Make advertised features real (highest trust priority — today the UI claims these as facts)
- [ ] **#30 — Real end-to-end encryption.** `crypto.ts:77,99` ship a **hardcoded** AES key
  (`"AetherMeshTrust1"` + zero-pad) in the JS bundle; the ECDH keypair is generated but
  `deriveKey`/`deriveBits` are **never called** (`crypto.ts:22`); the private key isn't persisted;
  `getPublicKey()` returns a **fake** literal (`crypto.ts:43`). Implement real ECDH→HKDF→AES-GCM (or
  adopt libsignal), persist keys, populate `ciphertext_payload`, or **remove the E2EE UI claims**.
- [ ] **#31 — Real safety-number verification.** `SafetyNumberModal.tsx:17` fabricates the peer key
  from the user id and "Mark as Verified" is a bare `localStorage.setItem` (`:28`) — the green
  "verified" screen is meaningless. Bind to actual public keys.
- [ ] **#32 — Real mesh / BLE / LoRa transport (or clearly label as demo).** `mesh.ts:235`
  `relayPacket` is a single `console.log`; `receivePacket` (`:201`) is never called (inbound mesh can
  never arrive); BLE/LoRa "connect" fabricate success with `Math.random()` RSSI (`:121,156`); peers are
  constructor fixtures.
- [ ] **#33 — Real AI copilot.** `backend/src/services/ai.service.ts` is keyword `includes()` →
  canned strings (no model/API key). Wire a real LLM (per the repo's own guidance, prefer a current
  Claude model) behind the existing `/ai/*` routes, or relabel as "demo".
- [ ] **#34 — Real multi-device linking & push.** `MultiDeviceLinkModal.tsx:17` is a 1500 ms
  `setTimeout` (button literally says "Simulate…"); implement QR/link-code pairing with key transfer.
  Verify `push.service.ts` actually sends Web Push (VAPID) and fix the endpoint-hijack upsert
  (`push.service.ts:50`) and the missing try/catch on `/push/subscribe` (`routes.ts:707`).
- [ ] **#35 — Fix `e2eeGroup.service.ts` or delete it.** Imported (`App.tsx:29`) but never called;
  `decryptGroupMessage` never advances `state.chainKey` (`:107`) while encrypt ratchets each message —
  if ever wired, only message 0 decrypts and the rest silently become the literal
  `'[Encrypted Aerogram Mesh Payload]'` (`crypto.ts:107`).
- [ ] **#36 — Remove or rebuild the fabricated APK download.** `androidInstaller.service.ts:37` emits
  4 ZIP magic bytes + JSON as `Twine_v3.0_release.apk` (~300 bytes, cannot install), reachable from the
  always-visible install banner. (`triggerAutoDownloadOnRegister` is now dead code — good.) Ship a real
  build or remove the banner.
- [ ] **#37 — Real screenshot detection** or drop the claim: `App.tsx:224` only catches a `PrintScreen`
  keydown (misses OS snip tools) and never notifies the other party or the server.
- [ ] **#38 — Add a TURN server** for WebRTC (`WebRTCManager.tsx:15` only configures Google STUN → calls
  fail behind symmetric NAT) and lift the **real** call duration into the summary (`App.tsx:857`
  hardcodes 60 s).

### B. Genuinely missing product capabilities (net-new)
- [ ] **#39 — Refresh-token rotation on the client** so 15-min access-token expiry doesn't force
  re-login / infinite reconnect (backend `refreshAccessToken` exists; client never calls it).
- [ ] **#40 — Server-authoritative disappearing messages** (TTL column + sweep job + tombstone push)
  so #20b becomes a real feature across devices.
- [ ] **#41 — Persist polls** (currently an in-memory `Map`, `message.service.ts:333`, lost on restart)
  and message reactions/analytics in the DB.
- [ ] **#42 — Request-body schema validation** (e.g. zod) replacing ad-hoc `if (!field)` checks, plus
  a global message-length constant shared by WS + REST (fixes #17/#18 at the source).
- [ ] **#43 — Reconcile the schema of record** — `db/schema.sql` is labelled "PostgreSQL Production"
  but uses SQLite syntax and has drifted from `db/index.ts`; pick one source of truth and decide
  `node:sqlite` (experimental) vs `better-sqlite3`/Postgres for production.

---

## 10. Suggested triage order

1. **Ship the media fix + strip the P0s:** commit #1's working-tree set; gate/remove `demo-login` (#2);
   rotate the JWT secret & set `NODE_ENV` (#3); authenticate `/uploads` (#4).
2. **Close the realtime/authz gaps:** #5 (rate limiters), #6 (WS revocation), #7/#8 (account-switch
   leakage), #9/#10 (pin/block).
3. **Correctness of core chat:** #14–#18 (dedup, ack timeout, outbox, message caps, null crash), #11
   (401/timeout).
4. **Restore the test harness (#21–#23)** so regressions like #1 are caught, then chip at P2/P4.
5. **Decide per §9A: implement vs. honestly relabel** every simulated "security" feature — this is the
   biggest user-trust risk.

*Note on `TODO.md`:* keep it for history, but treat this report as current. Its P0 auth-bypass,
HTTP-authorization, media-validation, and rate-limiter items are **already fixed**; its remaining valid
concerns are folded in above.
