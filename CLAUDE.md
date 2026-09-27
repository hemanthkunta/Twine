# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Backend
- Start development server: `cd backend && npm run dev`
- Build for production: `cd backend && npm run build`
- Start production server: `cd backend && npm run start`
- Run tests:
  - E2E test: `cd backend && npm run test:e2e`
  - Security audit: `cd backend && npm run test:security`
  - Comprehensive suite: `cd backend && npm run test:comprehensive`
  - Cross-platform sync: `cd backend && npm run test:sync`

### Frontend
- Start development server: `cd client && npm run dev`
- Build for production: `cd client && npm run build`
- Preview production build: `cd client && npm run preview`

### Both (from project root)
- Start both backend and client in development: `npm run dev`
- Build both: `npm run build`
- Run backend E2E test from root: `npm run test:backend`
- Sync: `npm run sync`

## Project Architecture

### Backend (Node.js/TypeScript)
- **Entry Point**: `src/server.ts` - sets up HTTP and WebSocket servers.
- **Configuration**: `src/config/index.ts` - loads environment variables.
- **Database**: `src/db/index.ts` - initializes SQLite database and runs seed data (demo users: Alice, Bob, etc.).
- **WebSocket Layer**:
  - Gateway: `src/ws/gateway.ts` - WebSocket server and event routing.
  - Handlers: `src/ws/handlers/` - individual handlers for events (auth, message, presence, etc.).
- **Services**: `src/services/` - business logic for various domains:
  - auth.service.ts: authentication and demo user management.
  - chat.service.ts: direct chats and chat membership.
  - message.service.ts: message persistence and receipts.
  - presence.service.ts: socket connection pooling and presence tracking.
  - group.service.ts: group chats.
  - media.service.ts: media handling.
  - push.service.ts: push notifications.
  - federation.service.ts: federation (if applicable).
  - LinkPreviewService.ts: link preview generation.
  - ai.service.tss: AI integration.
  - analytics.service.ts: analytics.
  - metrics.service.ts: metrics.
  - turn.service.ts: TURN server for WebRTC.
  - block.service.ts: blocking users.
- **HTTP API**: `src/http/routes.ts/http/routes.ts` - REST endpoints (e.g., for uploads, etc.).
- **Shared Types**: `src/types/protocol.ts` - WebSocket protocol and TypeScript interfaces.
- **Middleware**: `src/middleware/rateLimiter.ts` - rate limiting.
- **Test Suites**: `src/test/` - various test files (E2E, security, comprehensive, etc.).

### Frontend (React/Vite/TypeScript)
- **Entry Point**: `src/main.tsx` - React app bootstrapping.
- **Root Component**: `src/App.tsx` - main application layout and routing.
- **Components**: `src/components/` - reusable UI components:
  - AuthModal.tsx: login and 1-click demo account switcher.
  - ChatHeader.tsx: peer status, typing indicators, call buttons.
  - ChatList.tsx: sidebar with chats, search, and badges.
  - MessageArea.tsx: speech bubbles and message status (checkmarks).
  - MessageInput.tsx: message input, emoji picker, typing emitter.
  - UserAvatar.tsx: avatar with online status ring.
  - StatusTicks.tsx: message delivery and read receipts.
  - UserStatusBadge.tsx: live presence status.
  - CallModal.tsx: WebRTC voice/video call overlay.
  - NewChatModal.tsx: user search modal to start new chat.
- **Services**: `src/services/` - client-side services:
  - api.ts: REST API client.
  - ws.ts: resilient WebSocket client with reconnection.
  - sound.ts: Web Audio AI synthesizer for message sounds.
- **Types**: `src/types/index.ts` - shared TypeScript interfaces.
- **Styling**: `src/index.css` - Telegram-inspired glassmorphism dark theme with Tailwind CSS.

## Key Features
- Real-time messaging via WebSocket with sequenced frames.
- Optimistic UI with message acknowledgments.
- Presence tracking and live typing indicators.
- Delivery and read receipts (single/double grey/cyan checkmarks).
- End-to-end encryption ready (database and protocol support for ciphertext).
- WebRTC calling UI (simulated in this version).
- 1-click multi-account testing (Alice, Bob, Charlie, Diana) for development.
- Multi-device connection pooling.

## Environment
- Copy `.env.example` to `.env` and adjust as needed.
- The backend seeds demo users (Alice, Bob, etc.) with password `password123` on startup.

## Notes
- The WebSocket server runs on `ws://localhost:4000/ws`.
- The REST API is available at `http://localhost:4000/api`.
- The client runs on `http://localhost:3000` by default.
- For testing real-time features, open two browser tabs or use incognito windows to log in as different demo users.
- **Project Completion Status**: See [TODO.md](./TODO.md) for detailed completion checklist. Current estimates: Core MVP ~65%, Security & Trust ~25%, Extensibility ~8%.