# Aether — Telegram-Grade Real-Time Messaging Platform

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

### 3. User Experience & Testing
- **1-Click Multi-Account Tester Bar**: Instantly toggle between **Alice Walker**, **Bob Vance**, **Charlie Day**, and **Diana Prince** in the top navigation bar or across multiple browser tabs to test live bidirectional communication.
- **Interactive WebRTC Voice / Video Call Modal**: Call simulation overlay with mute controls, camera toggle, and active timer.
- **Telegram Glassmorphism Dark Theme**: Custom dark palette (`#0e1621`, `#17212b`, `#2b5278`, `#3fc5f0`), custom scrollbars, and pulsing presence dots.

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
│   │   │   └── presence.service.ts    # Socket connection pooling & presence
│   │   ├── ws/gateway.ts              # WebSocket server & event router
│   │   ├── http/routes.ts             # Express REST endpoints
│   │   ├── test/e2e_test.ts           # Automated E2E test script
│   │   └── server.ts                  # Server entry point
│   ├── package.json
│   └── tsconfig.json
│
└── client/
    ├── src/
    │   ├── components/
    │   │   ├── AuthModal.tsx          # Login & 1-Click demo selector
    │   │   ├── ChatHeader.tsx         # Peer status, typing, call buttons
    │   │   ├── ChatList.tsx           # Sidebar with live search & badges
    │   │   ├── MessageArea.tsx        # Speech bubbles & checkmarks
    │   │   ├── MessageInput.tsx       # Typing emitter & emoji picker
    │   │   ├── UserAvatar.tsx         # Avatar with online indicator ring
    │   │   ├── StatusTicks.tsx        # Message checkmark receipts
    │   │   ├── UserStatusBadge.tsx    # Live presence status
    │   │   ├── CallModal.tsx          # WebRTC voice/video call overlay
    │   │   └── NewChatModal.tsx       # User directory search modal
    │   ├── services/
    │   │   ├── api.ts                 # REST API client
    │   │   ├── ws.ts                  # Resilient WebSocket client
    │   │   └── sound.ts               # Web Audio API synthesizer
    │   ├── types/index.ts             # TypeScript interfaces
    │   ├── App.tsx                    # Root orchestrator
    │   ├── index.css                  # Telegram Glassmorphism design
    │   └── main.tsx                   # Client entry point
    ├── vite.config.ts
    └── package.json
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

### 2. Run Automated Protocol E2E Test
```bash
cd backend
npm run test:e2e
```

### 3. Start the Web Client
```bash
cd client
npm install
npm run dev
```
- Open `http://localhost:3000` in your browser.
- Open a second incognito or split window at `http://localhost:3000`.
- Log in as **Alice** in Window 1 and **Bob** in Window 2 to test instant bidirectional messaging, live typing indicators, and real-time read receipts!
