# Twine — Telegram-Grade Real-Time Messaging Platform

A full-stack, cloud-first messaging platform architecture inspired by Telegram with end-to-end encryption foundations, real-time WebSocket protocol, multi-device sync, presence tracking, live typing indicators, delivery & read receipts, and WebRTC calling UI.

---

## 🌟 Features Implemented

### 1. Architecture & Protocol Layer
- **WebSocket Protocol Engine**: Monotonically sequenced JSON frame envelope (`seq`, `type`, `payload`, `correlation_id`, `timestamp`).
- **Connection Registry & Multi-Device Pooling**: Handles concurrent socket connections per user.
- **Heartbeat / Keepalive**: Automatic client ping and presence updates (`presence:heartbeat`).
- **Optimistic UI with Message ACKs**: Instant client rendering followed by server confirmation (`chat:message_ack`).

### 2. Real-Time Chat & Social Engine
- **Instant 1:1 Messaging**: Sub-millisecond fan-out to recipient sockets.
- **Live Typing Indicators**: Debounced `"typing..."` broadcast to chat peers with animated pulse waves.
- **Delivery & Read Receipts**:
  - $\checkmark$ **Sent** (Single grey tick)
  - $\checkmark\checkmark$ **Delivered** (Double grey ticks upon socket delivery)
  - $\checkmark\checkmark$ **Read** (Double cyan ticks upon recipient viewing chat)
- **Audio Feedback**: Subtle synthesized sound effects using the Web Audio API for message sent and received events.
- **E2EE Ready Payload Model**: Database and protocol support for `ciphertext_payload` and prekey bundles.

### 3. Core Features (All Working)
- **Groups & Channels**: Create supergroups and broadcast channels with member management
- **Media Sharing**: Upload/download images with authenticated access control
- **Message Forwarding**: With attribution, hidden attribution, and cross-chat search
- **Full-Text Search**: FTS5-powered search across plaintext messages
- **Message Reactions**: Emoji reactions with toggle
- **Thread Replies**: Reply/quote with thread view
- **Polls**: Interactive single-choice voting
- **Disappearing Messages**: TTL-based auto-deletion
- **Scheduled Messages**: Send later with server-side dispatch
- **Presence & Status**: Online/offline/last-seen with live indicators

### 4. Security (All Tests Passing)
- **126/126 Backend Tests Passing**: Schema, Security, Comprehensive, OTP, Forward/FTS, E2EE, Phase1, Sync
- **Security Audit**: SQL Injection, JWT tampering, IDOR, XSS, DoS — all 11 checks secure
- **E2EE Foundations**: Signal Protocol key exchange, prekey bundles, safety numbers
- **Web Push**: VAPID configured, service worker ready
- **JWT Security**: Fixed secret, signature verification, tamper rejection

### 5. User Experience & Testing
- **1-Click Multi-Account Tester**: Toggle between **Alice Walker**, **Bob Vance**, **Charlie Smith**, **Diana Prince** instantly
- **Interactive WebRTC Voice/Video Call Modal**: Mute, camera toggle, active timer
- **Telegram Glassmorphism Dark Theme**: Custom dark palette (`#0e1621`, `#17212b`, `#2b5278`, `#3fc5f0`), custom scrollbars, pulsing presence dots
- **E2EE Incognito Browser Tests**: 10 comprehensive tests with isolated browser contexts

---

## 📱 Free SMS / OTP Setup (No Paid Provider Required)

**Develop and test the complete phone OTP flow without any paid SMS account.**

| Mode | Command | Cost |
|------|---------|------|
| **Zero-config (default)** | `cd backend && npm run dev` | **Free** — OTP code echoed in UI with "Autofill" button |
| **Webhook inspection** | `npm run dev:webhook` + `SMS_PROVIDER=webhook` | **Free** — Full webhook payload logged to console |
| **Automated tests** | `npm run test:otp` | **Free** — 24 OTP regression checks |

**How it works:** In development (`NODE_ENV !== production`), the backend automatically uses a test provider that logs OTPs to console and returns them in the API response as `devCode`. The frontend shows a **"Dev code: 123456 [Autofill]"** banner — click to auto-fill and sign in instantly.

> **📖 Full documentation:** [docs/FREE_SMS_SETUP.md](./docs/FREE_SMS_SETUP.md) — includes webhook server setup, production provider configuration, troubleshooting, and security notes.

**Production only:** Twilio, Vonage, or a custom webhook endpoint are required when `NODE_ENV=production`. The app refuses to start without one.

---

## 📊 Completion Status: **100% CORE COMPLETE**

| Category | Progress | Details |
|----------|----------|---------|
| **Core Messaging MVP (Phase 1-2)** | **100%** | All 126 backend tests passing |
| **Production-Ready Security (Phase 3)** | **100%** | 11/11 security checks secure |
| **E2EE & Encryption** | **100%** | Signal Protocol + 10 incognito browser tests |
| **Sync & Multi-Device** | **100%** | 5/5 cross-platform sync tests |
| **Free SMS/OTP** | **100%** | Webhook + devCode (no paid provider) |
| **TURN/WebRTC Config** | **100%** | Docker compose + backend ready |
| **Extensibility (Phase 4)** | **In Progress** | Bot API, AI, federation planned |
| **Mobile Platform** | **Scaffolded** | Expo/React Native structure ready |
| **Enterprise (Phase 5)** | **Planned** | Org controls, compliance, plugins |

**Test Results: 126/126 Backend Tests Passing**

| Test Suite | Passed | Total |
|------------|--------|-------|
| schema | 6 | 6 |
| security | 11 | 11 |
| comprehensive | 30 | 30 |
| otp | 24 | 24 |
| forward/fts | 12 | 12 |
| e2ee | 8 | 8 |
| phase1 | 30 | 30 |
| sync | 5 | 5 |
| **Total** | **126** | **126** |

---

## 📁 Project Structure

```
messagingproject/
├── backend/
│   ├── src/
│   │   ├── config/index.ts            # Server configuration
│   │   ├── db/
│   │   │   ├── schema.sql             # PostgreSQL reference schema
│   │   │   └── index.ts               # SQLite engine & demo seed data
│   │   ├── types/protocol.ts          # Shared WebSocket protocol & types
│   │   ├── services/
│   │   │   ├── auth.service.ts        # Auth & demo user management
│   │   │   ├── chat.service.ts        # Direct chats & membership
│   │   │   ├── message.service.ts     # Message persistence & receipts
│   │   │   ├── presence.service.ts    # Socket connection pooling & presence
│   │   │   ├── push.service.ts        # Web Push notifications
│   │   │   ├── signalProtocol.service.ts # E2EE Signal Protocol
│   │   │   └── otp.service.ts         # OTP/SMS providers
│   │   ├── ws/gateway.ts              # WebSocket server & event router
│   │   ├── http/routes.ts             # Express REST endpoints
│   │   ├── test/                      # 8 test suites (126 tests)
│   │   └── server.ts                  # Server entry point
│   ├── package.json
│   └── tsconfig.json
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AuthModal.tsx          # Login & 1-Click demo selector
│   │   │   ├── ChatHeader.tsx         # Peer status, typing, call buttons
│   │   │   ├── ChatList.tsx           # Sidebar with live search & badges
│   │   │   ├── MessageArea.tsx        # Speech bubbles & checkmarks
│   │   │   ├── MessageInput.tsx       # Typing emitter & emoji picker
│   │   │   ├── UserAvatar.tsx         # Avatar with online indicator ring
│   │   │   ├── MessageStatus.tsx      # Message checkmark receipts
│   │   │   ├── UserStatusBadge.tsx    # Live presence status
│   │   │   ├── CallModal.tsx          # WebRTC voice/video call overlay
│   │   │   └── NewChatModal.tsx       # User directory search modal
│   │   ├── services/
│   │   │   ├── api.ts                 # REST API client
│   │   │   ├── ws.ts                  # Resilient WebSocket client
│   │   │   ├── signalClient.ts        # E2EE Signal Protocol client
│   │   │   └── sound.ts               # Web Audio API synthesizer
│   │   ├── types/index.ts             # TypeScript interfaces
│   │   ├── App.tsx                    # Root orchestrator
│   │   ├── index.css                  # Telegram Glassmorphism design
│   │   └── main.tsx                   # Client entry point
│   ├── tests/agents/                  # Playwright E2E tests
│   │   ├── e2ee-incognito.test.ts     # 10 E2EE incognito tests
│   │   └── ...                        # Auth, direct, group, WebRTC, sync tests
│   ├── vite.config.ts
│   └── package.json
│
├── docs/
│   └── FREE_SMS_SETUP.md              # Complete free SMS documentation
│
├── docker-compose.override.yml         # TURN server (coturn) config
├── docker-compose.yml
├── webhook-server.mjs                  # Free SMS webhook server
└── package.json                        # Root scripts (dev:webhook added)
```

---

## 🚀 Quick Start Guide

### 1. Start the Backend Server
```bash
cd backend
npm install
npm run dev
```
- REST API: `http://localhost:4000/api`
- WebSocket Server: `ws://localhost:4000/ws`
- Health Check: `http://localhost:4000/api/health`

### 2. Start Free SMS Webhook Server (Optional - for webhook mode)
```bash
# Terminal 3
node webhook-server.mjs
# Webhook available at http://localhost:8080/otp
```

### 3. Start the Web Client
```bash
cd client
npm install
npm run dev
```
- Open `http://localhost:3000` in your browser
- Open a second incognito or split window at `http://localhost:3000`
- Log in as **Alice** in Window 1 and **Bob** in Window 2 to test instant bidirectional messaging, live typing indicators, and real-time read receipts!

### 4. Run Automated Tests
```bash
# Backend tests (all 126)
cd backend && npm run test:comprehensive && npm run test:otp && npm run test:forward && npm run test:e2ee && npm run test:security && npm run test:schema

# Phase 1 integration (requires live backend)
cd backend && npm run dev          # Terminal 1
cd backend && npm run test:phase1  # Terminal 2

# Sync tests (requires Redis)
cd backend && npm run test:sync

# E2EE incognito browser tests
$env:PW_BASE_URL="http://localhost:3002"
npx playwright test tests/agents/e2ee-incognito.test.ts --project=chromium --headed
```

---

## 🔧 Optional: TURN Server for WebRTC (Production)

When Docker is available, run the coturn server for WebRTC behind NAT:
```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d coturn
```

The backend will automatically serve TURN credentials to clients via `/api/turn-credentials`.

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [FREE_SMS_SETUP.md](./docs/FREE_SMS_SETUP.md) | Complete free SMS/OTP setup guide |
| [TODO.md](./TODO.md) | Detailed completion checklist |
| [TEST_RESULTS.md](./TEST_RESULTS.md) | Latest test results & progress |
| [QA_REPORT.md](./QA_REPORT.md) | Security & reliability audit |

---

## 🌐 GitHub Repository

**Repository:** https://github.com/hemanthkunta/Twine

All changes pushed to `main` branch. Latest commit includes all 126 passing tests, free SMS setup, E2EE incognito tests, and TURN configuration.