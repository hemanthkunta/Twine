# AGENTS.md

This file provides guidance to agents working with this Telegram-style real-time messaging platform.

## Quick Commands

### Backend (from `backend/`)
- `npm run dev` — tsx watch on `src/server.ts`
- `npm run build` — `tsc` (outputs to `dist/`)
- `npm run start` — `node dist/server.js`
- `npm run test` — runs schema + security + comprehensive suites
- `npm run test:e2e` — full E2E test (requires running server)
- `npm run test:phase1` — Phase 1 MVP suite (requires running server)
- `npm run test:otp` — OTP regression (no server needed)
- `npm run test:security` — security audit suite
- `npm run test:comprehensive` — comprehensive suite
- `npm run test:sync` — cross-platform sync suite
- `npm run test:forward` — forwarding + FTS check
- `npm run test:e2ee` — E2EE encryption test

### Frontend (from `client/`)
- `npm run dev` — Vite on port 3000 (`--host --force`)
- `npm run build` — `tsc && vite build`
- `npm run preview` — preview production build

### Root
- `npm run dev` — concurrently runs backend + client (cyan/magenta labels)
- `npm run build` — builds both
- `npm run test:backend` — backend E2E test
- `npm run test:e2e` — Playwright tests
- `npm run test:agents:<suite>` — agent test runner (`auth`, `direct`, `group`, `webrtc`, `presence`, `sync`, `parallel`, `all`)
- `npm run sync` — runs `scripts/sync.mjs`

## Architecture Gotchas

- **Backend entry**: `backend/src/server.ts` — sets up Express + WS on port 4000
- **Database**: SQLite (not PostgreSQL despite `schema.sql` name). `backend/src/db/index.ts` runs migrations + seeds demo users (Alice/Bob/Charlie/Diana, password `password123`)
- **WS protocol**: `backend/src/types/protocol.ts` — sequenced frames (`seq`, `type`, `payload`, `correlation_id`, `timestamp`)
- **E2EE**: Signal Protocol via `libsignal-protocol-typescript`. Keys never leave client; server stores only public halves in `identity_keys`, `signed_prekeys`, `one_time_prekeys`. Group sender keys in `group_sender_keys` are **opaque wraps** — server cannot read group messages.
- **Scheduled messages**: `scheduled_messages` table + 15s sweep in `server.ts` dispatches via normal send path
- **Disappearing messages**: `messages.expires_at` + `chats.disappearing_ttl_seconds` + same sweep hard-deletes
- **FTS search**: `messages_fts` virtual table (FTS5) with triggers; `MessageService.searchMessages` uses JOIN fallback to LIKE
- **Forwarding**: `MessageService.forwardMessage` — creates new message per target chat with `forwarded_from_*` provenance
- **Multi-device**: `device_sync_state` table tracks per-device `last_acked_seq` for catch-up

## Testing Quirks

- **Phase 1 tests** (`test:phase1`, `test:e2e`) require backend already running (`npm run dev` in another shell)
- **Playwright tests** in `tests/agents/` — need `npx playwright install` first
- **Agent test runner**: `node run-agent-tests.js <suite>` from root; suites: `auth`, `direct`, `group`, `webrtc`, `presence`, `sync`, `parallel`, `all`
- **Demo users**: Alice/Bob/Charlie/Diana seeded on startup; use 1-click switcher in AuthModal
- **Two tabs required** for real-time testing (incognito or separate windows)

## Environment

- Copy `.env.example` → `.env` (adjust `DB_PATH`, `PORT`, `JWT_SECRET`, etc.)
- WebSocket: `ws://localhost:4000/ws`
- REST API: `http://localhost:4000/api`
- Client: `http://localhost:3000`
- Health: `http://localhost:4000/api/health`

## Recent Changes (Uncommitted)

- **Sender keys**: `SenderKeyService` — stores opaque wrapped keys per (sender, recipient). **SECURITY WARNING**: wraps are unsigned — malicious server can substitute wraps under another member's `sender_id`. See `senderKey.service.ts` banner.
- **Legacy table drop**: `dropLegacyTables()` in `db/index.ts` gated by `DROP_LEGACY_TABLES=1` — logs row count, refuses auto-drop without env var
- **FTS search**: uses `JOIN messages_fts` instead of correlated subquery; escapes FTS5 special chars (`:*()-~^|+`)
- **Forward fanout**: parallel `createMessage` + batched receipts/broadcasts; 500 recipient cap
- **TTL clock**: `expires_at` uses local `Date.now()` — clock skew breaks multi-instance deploys (documented in `message.service.ts`)
- **E2EE key cache**: 5-min TTL + in-flight deduplication in `e2ee.ts` (`getPeerKeyFreshOrStale`)
- **Sweep timer**: self-rescheduling `setTimeout` with drift correction in `server.ts` (no `unref` starvation)

## TypeScript Notes

- **Backend**: `module: NodeNext`, `lib: ["ES2022"]`, no DOM globals (prevents browser API leaks)
- **Client**: `moduleResolution: bundler`, `isolatedModules: true`, `noEmit: true`
- Run `npx tsc --noEmit` in each package to typecheck

## Known Issues

- **Phases 1–2 are incomplete** (audited 2026-11-02). See TODO.md CORE-01 through CORE-10 and the current audit at the top of QA_REPORT.md; older completion claims are superseded.
- Push delivery is a stub: fake client subscriptions, no provider dispatch, and no production offline-send integration (CORE-01).
- Channel subscribers can post through forwarding; reproduced over HTTP (CORE-02).
- Encrypted forwarding copies ciphertext without destination re-encryption; server FTS cannot search blank encrypted `content_text` (CORE-03/04).
- `/uploads` is authenticated: ordinary in-chat media access passed live tests. Avatar retrieval returns 404 after successful upload/save; forwarded-media authorization checks only one referencing chat (CORE-05/06).
- Inactive-chat receipt updates are ignored; group typing is not tracked per user and lacks receiver expiry (CORE-07/08).
- Phone OTP backend/UI and Twilio/Vonage/webhook adapters exist. Real provider delivery remains unverified; OTP regression uses the test provider (CORE-09). 2FA completion was not assessed in this audit.
- E2EE integration is ongoing; encrypted browser interoperability and browser acceptance remain unverified in this audit (CORE-10).
- Test suite reliability flakiness (socket resets, timing)
- Groups/channels admin incomplete

### Latest verification (2026-11-02)

- Backend and client builds passed; schema 6/6, security 11/11, comprehensive 30/30, OTP 24/24, forwarding/FTS 12/12, live Phase 1 30/30 (113 checks total).
- Tests used temporary SQLite databases and an isolated live server on port 4407. Browser E2E and real SMS/push delivery were not run.
- Do not infer completeness from these passes: forwarding tests disable E2EE and push tests accept simulated success. See QA_REPORT.md for limitations and live reproductions.

## References

- `TODO.md` — detailed completion checklist
- `QA_REPORT.md` — security & reliability audit
- `telegram-like-app-blueprint.md` — architecture reference
