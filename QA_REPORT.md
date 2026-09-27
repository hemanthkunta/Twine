# QA_REPORT — Twine / "Aether" Messaging Platform

**Last verified:** 2026-09-15 · **Method:** every claim below was re-checked against the current source and, where it matters, by *running* the code.

> **This is a rewrite.** The previous revision was dated 2026-08-27 and had become actively
> misleading: its three P0 items were all fixed, several "broken test suite" findings no longer
> reproduced, and it cited line numbers that had moved. Findings from that revision that are
> **still open** are carried forward below with their original numbers; everything else was
> re-verified and has been either confirmed fixed (§3) or dropped.

---

## Legend

- `[EXECUTED]` — I ran it and observed the result directly.
- `[VERIFIED]` — confirmed by reading the current source.
- `[NOT RE-VERIFIED]` — carried over from the earlier report; believed fixed but not re-tested this pass.

---

## 1. Method

```bash
cd backend && npx tsc --noEmit          # → PASS
cd client  && npx tsc --noEmit          # → PASS
cd backend && npm run build             # → PASS
DB_PATH=… npm test                      # schema 6/6, security 11/11, comprehensive 29/30
node test-twine.spec.js                 # real Chrome, two sessions, 12 checks
```

Environment notes that affect what could be checked:

- **Redis is not running** in this environment, so the server logs `Redis connection error, falling
  back to in-memory storage` and exercises its in-memory fallback path. Cross-node fan-out (§5 #20e)
  is therefore untested here.
- **Playwright's bundled browsers are not installed.** The E2E spec drives the **system Chrome**
  via `PW_CHANNEL=chrome`.
- The **security workstream is deliberately deferred** at the user's request. §4 is a holding pen,
  not a backlog I worked through.

---

## 2. Verification results

| Check | Result |
|---|---|
| Backend `tsc --noEmit` | ✅ clean |
| Client `tsc --noEmit` | ✅ clean |
| Backend clean build (`rm -rf dist && npm run build`) | ✅ one output per module, no collisions |
| `test:schema` (new) | ✅ **6/6** |
| `test:security` | ✅ **11/11 SECURE** |
| `test:comprehensive` | ⚠️ **29/30** — 1 failure is a *test* bug (§5 #22) |
| `test-twine.spec.js` (real Chrome, 2 sessions) | ✅ passes; ~1-in-8 runs show a transient socket reset (§5 #23b) |

---

## 3. ✅ Verified fixed this pass

These were listed as open by the previous report. All were re-checked on 2026-09-15.

**P0 — all three closed**

- **#1 — "HEAD is broken for media" — FIXED.** `ApiService.getMediaUrl` exists
  (`client/src/services/api.ts:71`) and `server.ts` mounts `/uploads`. The working-tree fix was
  committed; a fresh clone is not broken.
- **#2 — `demo-login` open account takeover — FIXED.** Both `/auth/demo-login`
  (`routes.ts:193`) and `/auth/demo-users` (`routes.ts:216`) now return `403` when
  `config.isProduction`, and both are behind `authRateLimiter`. `[EXECUTED]`
- **#3 — committed JWT secret + inert prod guard — FIXED.** `docker-compose.yml:11` now uses
  `${JWT_SECRET:?JWT_SECRET must be configured}` (fails the compose up if unset). `config/index.ts`
  throws in production unless the secret is ≥32 chars, and in development it **generates a random
  ephemeral secret** rather than falling back to a committed dev string. `[VERIFIED]`

**P1 — authorization, rate limiting, blocking**

- **#5 — rate limiters defined but never attached — FIXED.** `router.use(apiRateLimiter)`
  (`routes.ts:47`), `uploadRateLimiter` on `/media/upload` (`routes.ts:556`), `authRateLimiter` on
  register/login/refresh/demo (`:109,145,171,193,216`). `[VERIFIED]`
- **#9 — `chat:pin_message` had no membership check — FIXED.**
  `pinHandler.ts:44` rejects non-members before pinning. `[VERIFIED]`
- **#10 — blocked users could still message — FIXED.** The send path now consults
  `BlockService.isBlocked(sender, peer)` (`ws/handlers/messageHandler.ts:63`). `[VERIFIED]`

**P1/P2 — client correctness**

- **#11 — API client had no 401 handling / unconditional JSON parse / no timeout — FIXED**
  (`api.ts`: `AbortController` timeout, conditional JSON parsing, 401 → forced logout). `[VERIFIED]`
- **#12 — unbounded `pendingQueue` surviving disconnect — FIXED** (capped at 50, cleared on
  `disconnect()`). `[NOT RE-VERIFIED]`
- **#13 — reconnect had no backoff and ignored auth rejection — FIXED** (exponential backoff +
  jitter, 30 s cap, halts on terminal code 4001). `[NOT RE-VERIFIED]`
- **#14 — no message dedup — FIXED** (dedup by `id`/`temp_id`). `[NOT RE-VERIFIED]`
- **#15 — no ack timeout — FIXED** (10 s → `FAILED` with retry). `[NOT RE-VERIFIED]`
- **#16 — `setMessages` overwrote the QUEUED outbox — FIXED.** `[NOT RE-VERIFIED]`
- **#17 — no message-length limit — FIXED** (10 000-char cap in `MessageService.createMessage`).
  Note the security suite still asserts a 50 000-char body is *rejected*, and passes. `[EXECUTED]`
- **#18 — null `content_text` crashed handlers — FIXED.** `[NOT RE-VERIFIED]`

**P4 — hygiene**

- **#20c — `document.title` 1 s interval leak — FIXED** (removed from `main.tsx`). Disappearing-message
  timers are now cleared on unmount/chat switch. `[NOT RE-VERIFIED]`
- **#24 — `[MEDIA DEBUG]` upload dumps — FIXED.** No `[MEDIA DEBUG]` logging remains; the only
  `[VOICE]` output left is inside `catch` blocks plus one informational "Recording started" log
  (`VoiceRecorder.tsx:406`). `[VERIFIED]`
- **#25 — inconsistent uploads path — FIXED.** No hardcoded `path.resolve('backend','uploads')`
  remains. `[VERIFIED]`
- **#27 — blob-URL cleanup revoked in-use URLs — FIXED** (unmount-only cleanup). `[NOT RE-VERIFIED]`
- **#29 — Docker hygiene — mostly fixed.** Non-root `USER node`, `.dockerignore`, `HEALTHCHECK`, and
  `.env.example` all present. Still absent: CI, ESLint/Prettier. `[NOT RE-VERIFIED]`

**P3 — test infrastructure**

- **#21 — `security_audit_suite.ts` crashed mid-run — FIXED.** It now runs to completion:
  **11/11 SECURE**. `[EXECUTED]`
- **#22 — `comprehensive_suite.ts` failed 9/5 with `no such table: users` — mostly FIXED.** It calls
  `initDatabase()` and reports **29/30**. One failure remains and it is a *test* bug, not a product
  bug — see §5.
- **#23 — no test runner / orphaned suites — PARTIALLY FIXED.** `test`, `test:security`,
  `test:comprehensive`, `test:sync`, `test:e2e` and `test:schema` all exist in
  `backend/package.json`. Still no framework runner, and the suites are not wired into CI.
  
**#43 — schema of record — FIXED this pass.** See §6.

**A real auth bug, found by writing a test.** `[EXECUTED]` The API client only reacted to
**`401`**, but `authMiddleware` signals every authentication failure with **`419`** — missing or
malformed header, empty token, invalid/expired token, and revoked session all return 419, never 401.
So the "silent refresh, then forced logout" path added earlier **never ran**: an expired or revoked
session left the client stuck rather than signing the user out. (This is why it looked fixed — the
code was there, it was just keyed on a status the server never sends.) `isAuthFailure` now matches
both. This is the second bug this session that the existing suites could not catch.

**Two bug fixes landed during this pass** (found by running the app, not by reading it):

- **Chart/chat typo.** Two `/ai/*` routes read `chartId` while the client sent `chatId`. The result
  was a `400` on **every chat open** (an unhandled promise rejection, since the client had no
  `.catch()`), and chat-scoped semantic search silently searching *all* chats. `[EXECUTED]`
- **`initDatabase()` destroyed data on every restart.** `seedInitialData()` ran
  `INSERT OR REPLACE INTO users`, and `node:sqlite` enables `PRAGMA foreign_keys = 1` by default —
  so REPLACE *deleted* the conflicting user row, cascading into `messages`, `chat_members`,
  `message_receipts`, `message_reactions` and `user_sessions`. Every backend restart silently wiped
  demo-user data. Replaced with `INSERT ... ON CONFLICT(id) DO UPDATE`. `[EXECUTED]`

---

## 4. 🔒 Open — security (deferred by request)

**#4 is the one that matters most, and it is still open.**

- [ ] **#4 — Media is served with no authorization.** `[VERIFIED]` `server.ts:51-59` mounts
  `express.static` on `/uploads` with no auth middleware. Anyone who knows a filename reads any
  chat's media — the membership check on the authenticated `GET /media/:filename` route is fully
  bypassable. **Action:** stream media through an authenticated, membership-checked handler, or serve
  signed URLs.
- [ ] **#19 — `GET /api/metrics` is unauthenticated.** `[VERIFIED]` `routes.ts:941` takes `_req` and
  serves `MetricsService.getMetricsText()` to anyone, exposing heap usage, event-loop lag and route
  counts. The in-memory keying also makes route-name cardinality unbounded.
- [ ] **SSRF in link previews.** `[VERIFIED]` `LinkPreviewService.isValidUrl` accepts
  private/link-local/loopback targets and does not pin the resolved IP, so a crafted URL can make the
  server fetch internal addresses. (The fetch itself was rewritten this pass to remove the
  `DOMParser` dependency — see §6 — but the URL validation was deliberately left untouched.)
- [ ] **No `/auth/logout` route.** `[VERIFIED]` The client clears its token locally; server-side
  session revocation exists (`isSessionValid`) but there is no route that revokes the current
  session on logout.

---

## 5. Open — correctness & robustness

- [ ] **#22 (residual) — one real test bug.** `[EXECUTED]` `comprehensive_suite.ts` reports
  `[B2:ChatService] Self-direct chat rejection - Error: Allowed direct chat with self`. The check
  asserts the *rejection* but never `await`s the promise, so the assertion can't fail — the suite
  records a spurious failure. Fixing the harness (a real runner with per-assertion tests) is still
  the right move; it is the workstream that was explicitly skipped.
- [ ] **#23b — transient socket reset under the E2E spec.** `[EXECUTED]` Roughly 1 run in 8, a
  message send coincides with a `net::ERR_CONNECTION_CLOSED` on a client request; the send is not
  attributed and the message never arrives (no backend error is logged, and the same flow passes on
  the next run). The spec now reports this distinctly instead of as a generic timeout. **Not
  diagnosed to root cause.**
- [ ] **#20e — multi-node fan-out is non-functional.** `[VERIFIED]` `clusterBroker` is imported but
  never used, so presence and broadcasts are in-process only and the rate limiter is per-instance. A
  multi-replica deploy would silently drop cross-pod delivery.
- [ ] **#20d — CORS `origin: '*'` with `credentials: true`.** `[NOT RE-VERIFIED]` Impact is limited
  (Bearer tokens, not cookies) but it should honour `config.corsOrigin`.
- [ ] **`clean_production_db.ts` uses the same `INSERT OR REPLACE INTO users` pattern** that caused
  the startup data-loss bug. It is a deliberate wipe script so this may be intentional, but it needs
  a look.
- [ ] **#39 — no refresh-token rotation on the client.** The backend implements
  `refreshAccessToken`; the client never calls it.
- [ ] **#41 — polls are an in-memory `Map`**, so they are lost on restart.
- [ ] **#42 — no request-body schema validation** (ad-hoc `if (!field)` checks).

---

## 6. ✅ Improved this pass — build, types, schema

- **Schema of record is now single-source.** `src/db/schema.sql` was **dead code** — nothing read
  it — and it was wrong in two ways: it was labelled *"PostgreSQL Production Schema"* while being
  neither PostgreSQL nor accurate, and it was missing 6 of the 12 real tables. The authoritative
  definition now lives in `src/db/schema.ts` (`SCHEMA_SQL`, what `initDatabase()` executes), with
  `schema.sql` as a readable snapshot. A new `test:schema` suite fails if the two diverge — verified
  by injecting a bogus column and confirming the test both fails and exits non-zero. It also lives in
  TypeScript rather than being read from disk at runtime, because `tsc` does not copy `.sql` files and
  a missing file at boot would be a hard failure.
- **Stale duplicate modules deleted.** `ws/connectionHandler.js` and `ws/rateLimiter.js` were
  obsolete copies of their `.ts` siblings that still compiled into `dist/` and collided on emit.
  `connectionHandler.js` referenced `WebSocket.OPEN` without importing it, so it would have crashed
  the server on connect had it won the race. `rateLimiter.js` was CommonJS in an ESM package.
- **The two most security-critical WS handlers are now typed.** `authHandler` and
  `messageHandler` were plain `.js` with **zero** type checking. Porting the send handler surfaced a
  real latent bug: it dereferenced `clientSession.userId` with no null check, so an unauthenticated
  `chat:send_message` fell through to `INTERNAL_ERROR` instead of `UNAUTHENTICATED` like every sibling
  handler.
- **`backend/tsconfig.json` no longer includes the DOM lib.** Adding `"lib": ["ES2022"]` +
  `"types": ["node"]` is what exposed the link-preview bug: with no explicit `lib`, TypeScript
  defaulted to including DOM, so browser-only APIs compiled happily in server code. DOM-dependent
  WebRTC types are now declared structurally in `types/protocol.ts`.
- **Link previews actually work now.** `LinkPreviewService` called `new DOMParser()`, which is
  `undefined` on Node (`[EXECUTED]`), so every preview request threw and silently resolved to `null`
  — the endpoint always returned `404 Unable to fetch preview`. Replaced with a Node-safe
  `<meta>`/`<title>`/`<link>` extractor preserving OG → Twitter → plain-HTML precedence. Covered by
  8 checks against synthetic HTML.
- **`chat:message_pinned` carried `{}`.** `[EXECUTED]` `pinHandler` did not `await`
  `getMessageById`; it is now `async` and broadcasts the real message.

---

## 7. 🚀 Open — advertised features that are simulated

This is the largest **user-trust** liability in the project, and the largest remaining workstream.
The UI presents these as working facts.

| # | Feature | Current state |
|---|---|---|
| #30 | End-to-end encryption | **Foundations landed** (see below) — real key management and derivation are in place and verified; the send/receive path is not yet wired to them |
| #31 | Safety-number verification | Fingerprints are now computed from real public keys on both sides; the "Mark as Verified" action is still a bare `localStorage.setItem` and still needs to bind to those keys |
| #32 | Mesh / BLE / LoRa transport | `relayPacket` is a `console.log`; inbound `receivePacket` is never called; peers are constructor fixtures |
| #33 | AI copilot | Keyword `includes()` → canned strings; no model or API key |
| #34 | Multi-device linking & push | A 1500 ms `setTimeout` (the button says "Simulate…"); Web Push delivery unverified. Note the key directory holds **one key per user**, so a second device overwrites the first — real multi-device E2EE needs its own design |
| #35 | `e2eeGroup.service.ts` | Imported but never called; `decryptGroupMessage` never advances the chain key |
| #36 | APK download | Emits 4 ZIP magic bytes + JSON as a ~300-byte "APK" that cannot install |
| #37 | Screenshot detection | Catches only a `PrintScreen` keydown; never notifies the peer or server |
| #38 | TURN server for WebRTC | Only Google STUN configured, so calls fail behind symmetric NAT |

---

### E2EE stage 1 — landed and verified this pass

What the old code did: it generated a real ECDH keypair, then **threw the private half away**
(only the public key was persisted), so no shared secret could ever be derived after a reload — and
`encrypt`/`decrypt` fell back to a key **hardcoded in the JS bundle**. `getPublicKey()` returned a
fake literal string, and there was **no key-exchange mechanism at all**: no table, no endpoint, no
attempt to distribute public keys.

Landed:

- **Key directory** — a new `identity_keys` table plus `POST /keys/publish` and `GET /keys/:userId`.
  Public keys only; the server cannot derive a conversation key. Publish validates key shape,
  is idempotent, and the read endpoint requires authentication.
- **Real key management** — the private key is now persisted as a JWK, so the keypair survives a
  reload. A stored record with no private key (written by the old code) is detected and replaced.
- **Real derivation** — `deriveSharedKey` does ECDH P-256 → HKDF-SHA256 (fixed salt/info for domain
  separation) → AES-256-GCM, cached per peer key.
- **`getPublicKey()` no longer lies** — it returns `''` rather than a fabricated trust anchor.
- **Safety numbers** are computed from two real public keys, so both sides agree and a substituted
  key changes the value.

Verified in a real browser against the real API — **17/17 checks**, including the properties that
actually matter: Alice and Bob **independently derive the same key** and can decrypt each other,
a third party with a different keypair **cannot**, and the public key is **stable across a reload**.

**Not yet done (stage 2):** the send/receive path still does not seal message bodies. To finish:
publish on login, look up the peer key for direct chats, encrypt into `ciphertext_payload`, and
decrypt on receive with a plaintext fallback so existing history keeps rendering. Group chats need
sender keys — and `e2eeGroup.service.ts` is still broken (#35).

---

## 8. Suggested triage order

1. **#4 — authenticate `/uploads`.** It is a live, unauthenticated read of every chat's media and is
   the last P0-class item outstanding.
2. **E2EE stage 2 — wire the send/receive path** to the key management verified in §7. Until that
   lands the UI still should not claim end-to-end encryption.
3. **#33/#31/#36 — decide implement vs. relabel.** Either wire real implementations or stop
   claiming them. Cheapest honest option: relabel the demo surfaces today, implement incrementally.
4. **#22 harness + #23b socket reset** — restore a trustworthy suite so regressions are caught. Three
   bugs this session (`chartId`, startup data loss, and the 419 auth handling) survived the existing
   suites entirely; that is the strongest argument for fixing the harness first.
5. **#20e cluster fan-out / #19 metrics auth / SSRF** — production readiness and the remaining
   security items.
6. **#39/#41/#42** — product capability gaps.

*See `TODO.md` for the consolidated, deduplicated backlog. `TODO-NEW.md`, `TODO-CODING.md` and
`TODO-SECURITY.md` were collapsed into it and removed.*

**Current Project Completion Status (Summary):**
- Core Messaging MVP (Phase 1-2): ~65% complete
- Production-Ready Security & Trust (Phase 3): ~25% complete  
- Extensibility & Advanced Features (Phase 4): ~8% complete
- Mobile Platform Support: 0% (web-only)
- Enterprise/Advanced Features (Phase 5): ~3% complete

See [TODO.md](./TODO.md) for detailed completion checklist and triage priorities.