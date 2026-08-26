# TODO — Missing / Incomplete Work

Gaps found during a read-only analysis of the codebase (2026-08-24). Nothing here is
implemented yet; each item names the file(s) where the work belongs. Ordered by severity.
This file only records what is missing — **no existing code has been changed.**

> Scope note: backend `cluster` / `federation` / `push` / `analytics` services are marked
> **[UNVERIFIED]** — the analysis pass covering them terminated early. Everything else was
> read directly.

---

## P0 — Security (must fix before any real deployment)

### Authorization is entirely absent
`authMiddleware` proves *who* you are and nothing ever checks *what you may access*. A grep for
any membership check across the whole backend returns zero hits.

- [ ] Add a reusable `ChatService.isMember(chatId, userId)` and call it from every chat-scoped route.
- [ ] `GET /chats/:id/messages` — gate on membership (`backend/src/http/routes.ts:203`);
      `MessageService.getChatMessages` filters only on `chat_id`
      (`backend/src/services/message.service.ts:60`).
- [ ] Same gate for `GET /chats/:id/members`, `GET /threads/:parentMessageId`,
      `GET /channels/:chatId/analytics`, `POST /chats/:id/read-all`, and every `/ai/*` endpoint
      that reads chat history.
- [ ] `chat:send_message` WS handler — reject sends to chats the sender isn't in
      (`backend/src/ws/gateway.ts:108` → `message.service.ts:6` inserts with no validation).
- [ ] Seeded chat IDs are literal and guessable (`chat_alice_bob_101`, `group_core_eng_201`), so
      this needs no enumeration to exploit.

### Authentication bypasses
- [ ] **Login skips the password check when none is supplied.**
      `if (password && user.password_hash)` (`backend/src/services/auth.service.ts:83`) — omit
      `password` from the body and any user's 7-day token is issued. Also fails open for rows
      with a null `password_hash`.
- [ ] **`/auth/demo-login` is an open token minter** — takes any `userId`, no credential, and
      (unlike `/auth/register`) no rate limiter (`backend/src/http/routes.ts:77`). Gate behind a
      dev-only env flag or strip from production builds.
- [ ] **Credential-less auto-login on the client.** `App.tsx:118-123` auto-logs-in as the first
      demo user when no token exists; `:107-112` does the same when `getMe()` fails — an expired
      session silently drops you into another account.
- [ ] **Session revocation is not enforced.** `revokeSession` sets `is_revoked = 1`
      (`auth.service.ts:188`) but `verifyToken` (`:21`) never consults `user_sessions`. Revoked
      devices keep working for the full token life. Needs a session id / `jti` claim.

### Secrets & transport
- [ ] **Remove the hardcoded JWT secret fallback** — fail fast if `JWT_SECRET` is unset instead
      of defaulting to a committed dev string (`backend/src/config/index.ts:6`).
- [ ] **A production JWT secret is committed in git.** `docker-compose.yml:12` hardcodes
      `JWT_SECRET=aether-production-secret-key-32chars` in a tracked file. Move to `env_file` /
      Docker secrets and rotate.
- [ ] **Tighten CORS** — `origin: '*'` with `credentials: true` (`backend/src/server.ts:16`);
      also `CORS_ORIGIN=*` in `docker-compose.yml:13`.
- [ ] **Protect `/metrics`** — served unauthenticated (`backend/src/http/routes.ts:406`).
- [ ] **Move the auth token out of `localStorage`** (XSS-readable) — `client/src/services/api.ts:6,11`.
      It is also sent in the WS **payload body** rather than a header (`ws.ts:67-71`), where it
      lands in logs more readily.
- [ ] **Add 401 handling** — `request` throws a generic `Error` (`api.ts:38-40`); expired tokens
      never trigger logout and instead feed an infinite reconnect loop.

### Upload & input validation
- [ ] **Validate media uploads.** `path.extname(fileName)` is attacker-controlled with no MIME or
      magic-byte check, then served statically → stored-XSS / arbitrary-file serving
      (`backend/src/services/media.service.ts:29`). Whitelist extensions, sniff content, cap size,
      set `Content-Disposition` + `X-Content-Type-Options`.
- [ ] **Add a message length limit** — `createMessage` inserts unbounded text
      (`message.service.ts:6-33`); a 50 KB body is accepted today.
- [ ] **Add request-body schema validation** (e.g. zod) instead of ad-hoc `if (!field)` checks
      scattered through `routes.ts`.

### Cross-account data leakage
- [ ] `handleFastSwitchUser` (`App.tsx:659-665`) swaps identity without clearing `messages`,
      `chats`, IndexedDB, or the group-key map; `handleLogout` (`:667-674`) also never clears
      IndexedDB. The previous user's cached messages persist in the shared `aerogram_offline_db`
      and re-render for the next user.

### Misleading security claims shown to users as verified facts
- [ ] The UI presents "End-to-End Encryption Trust Anchor" and "E2EE ECDH Trust: Preserved Over
      LoRa" as confirmed. Neither is true (see P1/P2). Either implement or remove the claims —
      this is the highest-risk item for user harm.
- [ ] **The APK download is a fabricated file.** `androidInstaller.service.ts:59-65` emits 4 ZIP
      magic bytes plus a JSON blob as `Twine_v3.0_release.apk`; it cannot install.
      `triggerAutoDownloadOnRegister` (`:82`) pushes it **unsolicited at registration**, training
      users to enable unknown-source installs for a file that will fail to parse. Remove.

---

## P1 — Correctness & robustness

### The E2EE layer does not encrypt anything
The server sees plaintext on every message. `App.tsx:577-585` sends the body raw;
`Message.ciphertext_payload` is never populated; `Chat.is_e2ee` is a display flag only.

- [ ] **Replace the hardcoded AES key.** `crypto.ts:77` and `:99` set the key to ASCII
      `"AetherMeshTrust1"` + 16 zero bytes, shipped in the JS bundle. Obfuscation, not encryption.
- [ ] **Perform the ECDH.** A real P-256 keypair is generated (`crypto.ts:8-39`) but
      `deriveKey`/`deriveBits` are requested at `:22` and never called anywhere. The keypair is
      decorative.
- [ ] **Persist the private key.** Only `{publicKeyBase64, createdAt}` is saved (`:33-36`); the
      early return at `:10-13` leaves `localKeyPair` permanently `null` after any reload, so the
      identity cannot survive a refresh.
- [ ] **Remove the fake pubkey fallback** — `getPublicKey()` returns the literal
      `'04a3b8c9f2...ecdh_p256_trust_anchor'` (`crypto.ts:43`), which the UI displays as the real
      trust anchor because `MeshRadarModal.tsx:15` / `SafetyNumberModal.tsx:18` read it
      synchronously before async init resolves.
- [ ] **Safety-number verification is theater** — `SafetyNumberModal.tsx:17` fabricates the peer
      key when absent (`peer.public_key || \`04_${peer.id}_...\``), so the green "verified" screen
      can be computed over a string derived from a user ID. "Mark as Verified" is a bare
      `localStorage.setItem` (`:31`) with no cryptographic binding.
- [ ] **Fix or delete `e2eeGroup.service.ts`** (153 lines, imported at `App.tsx:10`, **never
      called**). The receive side never advances the ratchet (`:122-130` reads `state.chainKey`
      and never reassigns), so only message 0 decrypts; message 2+ fall through to the literal
      string `'[Encrypted Aerogram Mesh Payload]'` (`crypto.ts:107`) — **silent data loss
      disguised as a UI label**. Also: no signature verification in `ingestPeerSenderKey`
      (`:39-49`) despite carrying `signingPubKeyHex`, in-memory-only key state, and the raw group
      secret held in cleartext with no per-recipient wrapping.

### App.tsx bootstrap effect re-fires on every modal toggle
- [ ] **`App.tsx:242-258`** — the mount effect's dependency array contains **15 modal booleans**,
      so opening any modal tears down and re-runs the whole bootstrap: `getDemoUsers()` →
      `getMe()` → possibly `demoLogin()` → `wsClient.connect()`, and re-registers all listeners.
      Opening Settings fires a network bootstrap and can swap the token mid-session. Split the
      Escape handler into its own effect or read modal state from a ref.
- [ ] `activeChatRef.current` is assigned **during render** (`App.tsx:88`) — unsafe under
      StrictMode / concurrent rendering.

### WebSocket & API client
- [ ] **Reconnect has no backoff, jitter, or attempt cap** — fixed 2000 ms retry
      (`ws.ts:145-151`). An invalid token produces an infinite 2 s hammer loop, since auth
      rejection is never handled.
- [ ] `pendingQueue` (`ws.ts:13`) is unbounded and not cleared by `disconnect()`.
- [ ] `api.ts` `request<T>` (`:21-42`) has no timeout, no `AbortController`, no retry. `await
      res.json()` is unconditional (`:37`), so a 502 HTML page or a 204 throws a `SyntaxError`
      that masks the real status.

### Message state integrity
- [ ] **No dedup by message id** — every WS event appends `[...prev, msg]`, so reconnect +
      refetch duplicates messages.
- [ ] `setMessages(res.messages)` (`App.tsx:312`) overwrites the local cache including `QUEUED`
      outbox items, so offline-composed messages visually vanish when connectivity returns.
- [ ] **No ack timeout** — if a WS ack never arrives the temp message stays `isSending` forever.
- [ ] Inverted semantics: `isSending: isConnected` (`App.tsx:552`) — `true` actually means "sent".
- [ ] `chat:new_message` both increments `unread_count` and calls `refreshChats()`
      (`App.tsx:372-389`), racing the setState.
- [ ] **Disappearing messages are UI-only** — `App.tsx:366-369`, `:570-572` filter from React
      state, but the row was already written to IndexedDB and is never deleted there or
      server-side; it reappears on reload. `disappearing.service.ts:10` declares
      `messageExpiryTimers` and never uses it.

### Memory leaks
- [ ] **`main.tsx:45`** — a 1-second `setInterval` rewriting `document.title`, never cleared.
- [ ] Disappearing-message `setTimeout`s (`App.tsx:366,570`) are never cleared on unmount or chat
      switch — with the 1-week option these are long-lived handles capturing state setters.
- [ ] `triggerScreenshotWarning`'s 4.5 s timeout (`App.tsx:263`) is never cleared.
- [ ] `mesh.ts:13` `packetCache` is commented "LRU" but has **no LRU and no eviction**; the
      `mesh_packets` IndexedDB store is written on every packet and never pruned; the `messages`
      store has no cap or TTL.
- [ ] `WebRTCManager.tsx:41-78` has `[]` deps but closes over `onEndCall` and `peer` — stale
      closure risk.
- [ ] **Bound the rate-limiter map** — `RateLimiter.buckets` (`backend/src/middleware/rateLimiter.ts:9`)
      is never evicted (unbounded growth), resets on restart, and isn't shared across instances.
      Add TTL eviction; back with Redis for multi-node.

### Data layer
- [ ] **Reconcile the DB schema.** `backend/src/db/schema.sql` is labeled "PostgreSQL Production
      Schema" but uses SQLite `datetime('now')` and has drifted from the real runtime schema in
      `db/index.ts` (missing `is_bot`, `message_reactions`, `pinned_messages`). Pick one source of
      truth.
- [ ] **`node:sqlite` `DatabaseSync` is an experimental Node API** being used as the production
      datastore, with its typing suppressed by `// @ts-ignore` (`db/index.ts:1-2`). Decide:
      accept the risk, or move to `better-sqlite3` / Postgres.
- [ ] **Verify WS heartbeat/timeout enforcement** — confirm dead sockets are reaped and stale
      presence cleared (`backend/src/services/presence.service.ts`).

---

## P2 — Features advertised as real but simulated

Either build these or label them unambiguously in the UI. The pattern throughout: a real
browser API is invoked, its result is discarded in favour of constants or `Math.random()`, and
the UI reports unconditional success — which makes the facade more convincing, and more
dangerous, than a plainly stubbed one.

- [ ] **Mesh / BLE / LoRa transport — nothing ever leaves the browser tab.**
      `relayPacket` (`mesh.ts:235-238`) is the entire transmit path and its body is one
      `console.log`. `receivePacket` (`:201`) is never called from anywhere, so the App mesh
      listener (`App.tsx:206-233`) can never fire. "Nodes in range" are constructor fixtures
      (`mesh.ts:29-60`) with hardcoded RSSI and fake pubkeys.
- [ ] `scanBluetoothLE` (`mesh.ts:92`) does call `navigator.bluetooth.requestDevice`, but on
      **any** outcome — including user cancel — fabricates a peer with `Math.random()` RSSI
      (`:121-132`). `device.gatt.connect()` is never called. The button always "succeeds."
- [ ] `connectLoRaSerial` (`:138`) opens a port but never obtains a reader/writer and never
      speaks Meshtastic; on failure it fabricates `isConnected: true` (`:156-161`).
- [ ] `LoRaBridgeModal.tsx` frequency/baud dropdowns (`:108-132`) write to local `useState` and
      are never passed to `meshService`; `"10 – 15 km Line-of-Sight"` (`:143`) is hardcoded JSX.
- [ ] **AI copilot** — `backend/src/services/ai.service.ts:30` is a chain of
      `combined.includes('webrtc')` → push a canned sentence. No LLM, no API key, no model.
      (Note the irony at `:40`: a hardcoded string asserting *"double-ratchet group encryption
      verified."*)
- [ ] **Multi-device linking** — `MultiDeviceLinkModal.tsx:114` button is literally labelled
      "Simulate Secondary Device Scan", backed by a 1500 ms `setTimeout` (`:17-23`).
- [ ] **Screenshot detection** — keys off a `PrintScreen` keydown (`App.tsx:199-201`); doesn't
      fire for OS snipping tools, and there's no server notification, so the warning is shown
      only to the person taking the screenshot.
- [ ] Mock data still wired into shipped UI: `AIModerationModal.tsx:15` `mockAuditLogs`,
      `StoriesBar.tsx:16` `DEMO_STORIES`, `VoiceRecorder.tsx:114,155` simulated waveform.
- [ ] **[UNVERIFIED]** `cluster.service.ts` (112 lines) — confirm real cross-node pub/sub vs.
      in-process no-op; the WS gateway currently assumes single-process fan-out.
- [ ] **[UNVERIFIED]** `federation.service.ts` (31 lines) — returns status only; no bridging.
- [ ] **[UNVERIFIED]** `push.service.ts` (29 lines) — confirm it actually sends Web Push (VAPID).
- [ ] **[UNVERIFIED]** `analytics.service.ts` (29 lines) — confirm real aggregation vs. canned numbers.

### WebRTC is real, but incomplete
- [ ] **Add a TURN server** — only Google STUN is configured (`WebRTCManager.tsx:15-20`), so
      calls fail behind symmetric NAT.
- [ ] `WebRTCManager.tsx:153` sets `callStatus = 'connected'` on **any** init error — the UI
      reports a connected encrypted call when WebRTC failed entirely. `:110-118` falls back to a
      blank canvas `captureStream` when no mic/cam.
- [ ] Real call duration is tracked in `WebRTCManager` but never reported up;
      `handleEndCall` hardcodes **145 seconds** for the AI call summary (`App.tsx:678`).

---

## P3 — Testing (no framework, and the suites overstate coverage)

- [ ] **Add a test runner** — no Jest/Vitest/Mocha/`node:test` in either `package.json`. All four
      files in `backend/src/test/` are standalone `tsx` scripts with hand-rolled `console.log`
      reporting.
- [ ] **Wire up the orphaned suites** — only `e2e_test.ts` has an npm script
      (`backend/package.json:10`). `comprehensive_suite.ts`, `cross_platform_sync_suite.ts`, and
      `security_audit_suite.ts` are referenced by nothing.
- [ ] **Make suites runnable on a clean clone** — `comprehensive_suite.ts:11` and
      `security_audit_suite.ts:5` import `db` but never call `initDatabase()`, so they fail with
      "no such table: users" (the `.db` file is correctly gitignored).
- [ ] **Stop one failure from hiding the rest** — each module is a single giant `try/catch`
      (e.g. `comprehensive_suite.ts:36-87`), so the first failing assert aborts all remaining
      tests in that module and records one generic failure (`:86`).
- [ ] **`cross_platform_sync_suite.ts` cannot report a failure.** Pass-recording is nested inside
      the success branch (`:98-101`, `:121-124`) — a mismatch pushes nothing and records no
      failure; `:190` prints `[PASS]` unconditionally and `:192` prints **`Failed: 0` as a
      hardcoded string literal**.
- [ ] **Fix the rigged checks in `security_audit_suite.ts`** (12 of ~14 "SECURE" lines are
      preordained):
  - [ ] SQL injection (`:31-50`) — `prevented: true` is hardcoded in **both** the try (`:38`) and
        catch (`:46`) branches; no path sets `false`. It also tests a parameterized query written
        in the test body (`:33`), never a real endpoint.
  - [ ] Stored XSS (`:119-134`) — verdict is `msg.content_text === xss` (`:131`), i.e. it passes
        precisely **because** no sanitization occurred. Inverted logic, waved off at `:132` with
        an unverified claim about client rendering.
  - [ ] DoS / oversized payload (`:139-161`) — `prevented: hugeMsg.content_text.length === 50000`
        (`:150`) records the *success* of an unbounded 50 KB insert as a pass.
- [ ] **Keep and build on what's genuine** — JWT `alg:none` and tamper rejection (`:56-78`), the
      IDOR check (`:92-109`, which really does pass thanks to `message.service.ts:82-85`), and the
      protocol-flow assertions in `e2e_test.ts` (`:86-91`, `:143-145`, `:151-153`, `:171-174`).
- [ ] **Replace `sleep()`-based sequencing with event awaiting** — `e2e_test.ts:82,139,166` is
      timing-brittle; both network suites hardcode `localhost:4000` with no setup/teardown.
- [ ] Note: the existing suites missed the live auth bypass at `auth.service.ts:83`.

---

## P4 — Build, deploy & engineering hygiene

### Docker
- [ ] **Run as non-root** — no `USER` directive; the final stage runs `node dist/server.js` as
      uid 0 (`Dockerfile:34`).
- [ ] **The frontend is built and then never served.** `Dockerfile:30` copies the client build to
      `/app/public`, but `server.ts:27` only registers `express.static` for `uploads` — there is
      no static mount for `public` and no SPA fallback. Stage 1's entire build is dead weight and
      the "full-stack" image is API-only.
- [ ] **Add a `.dockerignore`** (absent). `COPY backend/ ./` (`:16`) and `COPY client/ ./` (`:8`)
      drag in local `node_modules`, `backend/messaging.db`, its `-wal`, and `uploads/*.png` —
      baking a dev database into the image and potentially over the `npm ci` output.
- [ ] `Dockerfile:28` — `npm ci --only=production` is deprecated (use `--omit=dev`) and
      re-installs from context-copied manifests instead of reusing the builder stage.
- [ ] **Add a `HEALTHCHECK`** — `checkDbHealth()` already exists (`db/index.ts:29`) and
      `/api/ready` is wired, but nothing uses it.
- [ ] **Add `tini`/`dumb-init`** — bare `node` as PID 1 mishandles SIGTERM, defeating the
      graceful-shutdown handler in `server.ts:52`.
- [ ] Drop the obsolete `version: '3.8'` from `docker-compose.yml:1`.

### Tooling
- [ ] **Add CI** — no `.github/workflows` (or any other CI config). Needs build + type-check +
      test on push.
- [ ] **Add ESLint + Prettier** — no config and no `eslint` dependency in either package.
- [ ] **Add a real type-check gate** — backend `build` (`tsc`) emits rather than checks; the only
      type gate in the project is the client's `tsc && vite build`, and it's local-only.
- [ ] **Tighten tsconfig** — both have `strict: true` (good), but neither enables
      `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, or
      `noImplicitReturns`. The client **explicitly disables** `noUnusedLocals` and
      `noUnusedParameters` (`client/tsconfig.json:15-16`). `strict` is also undercut in practice
      by `as any` in the data layer (`message.service.ts:82,97,105`) and the `// @ts-ignore` over
      the DB import.
- [ ] **Add `.env.example`** documenting `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `DB_PATH`.
- [ ] Set `changeOrigin: true` on the `/ws` proxy (`client/vite.config.ts:17-20`) — it's set for
      `/api` (`:15`) but not for `/ws`.

### Performance & structure
- [ ] **Split `App.tsx`** — 1,082 lines, ~30 `useState`, all 11 WS subscriptions, every modal
      flag. `ChatHeader` takes 16 props (`:802-824`), `ChatList` 12 (`:781-797`). Extract into
      context/reducer or a store.
- [ ] **Add memoization** — there is no `React.memo`, `useMemo`, or `useCallback` anywhere in the
      client, so every child gets new function props on each render, and `App` re-renders on
      every presence/typing frame.
- [ ] **Virtualize `MessageArea`** (448 lines) — `renderFormattedText` (`:23-54`) re-splits and
      re-regexes every message body on every parent render.
- [ ] **Cache and cancel per-chat fetches** — a chat switch fires 4-5 requests
      (`App.tsx:297,304,310,316,321`) with no caching or cancellation; rapid switching races and
      the last response wins arbitrarily.
- [ ] `getSmartReplies` is re-fetched on **every** incoming message (`App.tsx:359`).
- [ ] `moderateContent` adds a blocking round-trip before every send (`App.tsx:521`) with no
      `try/catch` — offline, the unhandled rejection silently aborts the send.
- [ ] `chats.sort()` runs on every incoming message (`App.tsx:388`);
      `meshService.getPeers().length` is called during render (`:807`), which is non-reactive and
      allocates each render.
- [ ] **Delete dead code** — `CallModal.tsx` (100 lines, imported nowhere);
      `e2eeGroup.service.ts` if not fixed; rename the misleading `unsubAuthAck`
      (`App.tsx:487-492`), which is the handler, not an unsubscriber.
- [ ] The inline "Enter Twine Vault" login (`App.tsx:894-900`) omits the `initIdentityKey` and
      `wsClient.connect()` calls that every other login path makes.

---

## Confirmed non-issues (don't spend time here)

- **XSS in message rendering is clean** — no `dangerouslySetInnerHTML` or `innerHTML` anywhere in
  `client/src`. `renderFormattedText` (`MessageArea.tsx:23-54`) builds React elements from split
  parts, so bodies are escaped; `@mention` spans aren't anchors, so there's no `javascript:` vector.
- **`.gitignore` is correct** — verified via `git ls-files` that `backend/messaging.db` and
  `backend/uploads/*.png` are **untracked** local artifacts. Of 94 tracked files none is a `.db`,
  media file, or `.env`. Only `uploads/.gitkeep` is tracked, as intended.
- **Compose declares no phantom infrastructure** — one service, no unused Postgres/Redis, and the
  volume wiring (`DB_PATH` ↔ `aether_data`, `uploads`) is coherent.
- **Genuinely working:** WS transport and fan-out; optimistic send with IndexedDB persistence;
  outbox store-and-forward flush (`mesh.ts:241-266`, which is cloud relay, not mesh); WebRTC
  offer/answer/ICE and screen share; `storage.ts` IndexedDB layer; `sound.ts` Web Audio synthesis;
  theme tokens via CSS custom properties; the safety-number SHA-256 math (the derivation, not its
  inputs); WAL pragmas and compound indices (`db/index.ts:18`); graceful shutdown (`server.ts:52`).
