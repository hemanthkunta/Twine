# Graph Report - messagingproject]  (2026-09-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 961 nodes · 2345 edges · 57 communities (42 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.85)
- Token cost: 24,826 input · 2,654 output

## Community Hubs (Navigation)
- Messaging UI Components
- Crypto Utilities
- Backend Dependencies
- AI Messaging Features
- React UI Components
- WebRTC Protocol Types
- Frontend Dependencies
- LoRa Mesh Transport
- Chat and Block Services
- Presence and Chat Service
- Mesh Networking UI
- API Routes and Rate Limiting
- Authentication Service
- Server Federation Service
- Metrics and Gateway Service
- Modal Components
- Live Wallpaper Service
- Config and Link Preview
- Client TypeScript Config
- Database Initialization
- Redis Poll Service
- Backend TypeScript Config
- Database Pooling
- Message and Preview Components
- WebRTC Manager
- Message Handlers
- Push Notification Service
- Web App Manifest
- Chat List and Stories
- Realtime Socket Client
- Cluster Broker Service
- Playwright Test Scripts
- Message Data Models
- Call and Safety Modals
- Sound Service
- Sender Key Service
- Root Package Dependencies
- Link Preview Service
- Chat Header and Status Badge
- Message Input and Voice Recorder
- End-to-End Encryption Tests
- Key Directory Service
- Project Scripts
- Git Sync Script
- Media Service
- Schema Consistency Tests
- E2EE Message Tests
- Logo Components
- Disappearing Message Service
- Dev Dependencies
- Vite Environment Types
- WebRTC Stats Verification
- COTURN Setup Script

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 83 edges
2. `react` - 39 edges
3. `App()` - 35 edges
4. `Message` - 33 edges
5. `CryptoService` - 33 edges
6. `runTests()` - 33 edges
7. `MessageService` - 32 edges
8. `lucide-react` - 32 edges
9. `AuthService` - 29 edges
10. `PresenceService` - 24 edges

## Surprising Connections (you probably didn't know these)
- `StoriesBarProps` --references--> `User`  [EXTRACTED]
  client/src/components/StoriesBar.tsx → client/src/types/index.ts
- `CreatePollModalProps` --references--> `Message`  [EXTRACTED]
  client/src/components/CreatePollModal.tsx → client/src/types/index.ts
- `MessageInputProps` --references--> `Message`  [EXTRACTED]
  client/src/components/MessageInput.tsx → client/src/types/index.ts
- `MessageAreaProps` --references--> `Message`  [EXTRACTED]
  client/src/components/MessageArea.tsx → client/src/types/index.ts
- `ThreadModalProps` --references--> `Message`  [EXTRACTED]
  client/src/components/ThreadModal.tsx → client/src/types/index.ts

## Import Cycles
- None detected.

## Communities (57 total, 15 thin omitted)

### Community 0 - "Messaging UI Components"
Cohesion: 0.06
Nodes (13): App(), AuthModal(), CreateGroupModal(), CreatePollModalProps, GlobalSearchModal(), MessageArea(), renderFormattedText(), MessageInputProps (+5 more)

### Community 1 - "Crypto Utilities"
Cohesion: 0.08
Nodes (17): base64ToBytes(), bytesToBase64(), CryptoService, CURVE, ECDH_ALGO, GroupEnvelope, SenderKeyPayload, StoredIdentityKey (+9 more)

### Community 2 - "Backend Dependencies"
Cohesion: 0.04
Nodes (47): dependencies, bcryptjs, cors, dotenv, express, ioredis, jsonwebtoken, pino (+39 more)

### Community 3 - "AI Messaging Features"
Cohesion: 0.11
Nodes (12): AIService, ChannelAnalyticsService, MessageService, assert(), results, runTests(), TestResult, testMessageServiceRedisIntegration() (+4 more)

### Community 4 - "React UI Components"
Cohesion: 0.10
Nodes (25): AIAssistantBar(), AIAssistantBarProps, AIModerationModal(), AIModerationModalProps, CallSummaryModal(), CallSummaryModalProps, CreatePollModal(), DisappearingTimerModal() (+17 more)

### Community 5 - "WebRTC Protocol Types"
Cohesion: 0.10
Nodes (33): IceCandidateInit, Reaction, SessionDescriptionInit, UserSession, WebRTCAnswerPayload, WebRTCCallPayload, WebRTCHangupPayload, WebRTCIceCandidatePayload (+25 more)

### Community 6 - "Frontend Dependencies"
Cohesion: 0.06
Nodes (35): dependencies, clsx, lucide-react, react, react-dom, devDependencies, autoprefixer, postcss (+27 more)

### Community 7 - "LoRa Mesh Transport"
Cohesion: 0.11
Nodes (3): MeshTransportService, OfflineStorageService, MeshPacket

### Community 8 - "Chat and Block Services"
Cohesion: 0.12
Nodes (9): BaseService, BlockService, GroupService, auditResults, runSecurityAudit(), SecAuditResult, Chat, ChatType (+1 more)

### Community 9 - "Presence and Chat Service"
Cohesion: 0.19
Nodes (9): ChatService, ConnectedClient, logger, PresenceService, ChatMember, WSUserTypingPayload, handleAuthHandshake(), handlePresenceHeartbeat() (+1 more)

### Community 10 - "Mesh Networking UI"
Cohesion: 0.13
Nodes (17): ChannelAdminDashboardModal(), ChannelAdminDashboardModalProps, LoRaBridgeModal(), LoRaBridgeModalProps, MeshRadarModalProps, MeshPacketListener, meshService, PeerUpdateListener (+9 more)

### Community 11 - "API Routes and Rate Limiting"
Cohesion: 0.11
Nodes (15): apiRateLimiter, authRateLimiter, Express, NOTE: the client sends `chatId`; this route previously read `chartId`, so, NOTE: the client sends `chatId`; this route previously read `chartId`,, Request, uploadRateLimiter, RateLimitBucket (+7 more)

### Community 12 - "Authentication Service"
Cohesion: 0.21
Nodes (4): authMiddleware(), AuthService, runCrossPlatformSyncSuite(), User

### Community 13 - "Server Federation Service"
Cohesion: 0.13
Nodes (14): router, allowedOrigins, app, logger, publicDir, server, wss, FederationBridgeService (+6 more)

### Community 14 - "Metrics and Gateway Service"
Cohesion: 0.18
Nodes (9): MetricsService, handleConnection(), setupWebSocketGateway(), checkNewConnectionRate(), connectionCounts, decrementConnectionCount(), getConnectionCount(), incrementConnectionCount() (+1 more)

### Community 15 - "Modal Components"
Cohesion: 0.17
Nodes (13): AuthModalProps, CreateGroupModalProps, NewChatModal(), NewChatModalProps, SettingsModalProps, ThreadModal(), ThreadModalProps, UserAvatar() (+5 more)

### Community 16 - "Live Wallpaper Service"
Cohesion: 0.16
Nodes (9): LiveWallpaper(), rand(), read(), WPState, WALLPAPER_EVENT, WALLPAPER_PRESETS, WallpaperDefinition, WallpaperKind (+1 more)

### Community 17 - "Config and Link Preview"
Cohesion: 0.18
Nodes (12): config, __dirname, __filename, logger, projectRoot, CacheEntry, LinkPreviewData, TurnCredentialResponse (+4 more)

### Community 18 - "Client TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 19 - "Database Initialization"
Cohesion: 0.17
Nodes (12): checkDbHealth(), db, dbDir, logger, SCHEMA_MIGRATIONS, SCHEMA_SQL, defaultPasswordHash, insertUserStmt (+4 more)

### Community 20 - "Redis Poll Service"
Cohesion: 0.16
Nodes (4): gracefulShutdown(), RedisService, testRedisConnection(), Poll

### Community 21 - "Backend TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir (+7 more)

### Community 22 - "Database Pooling"
Cohesion: 0.26
Nodes (5): dropLegacyTables(), initDatabase(), PooledDatabase, PooledStatement, seedInitialData()

### Community 23 - "Message and Preview Components"
Cohesion: 0.18
Nodes (11): LinkPreview(), LinkPreviewData, LinkPreviewProps, MessageAreaProps, REACTION_EMOJIS, PollCard(), PollCardProps, StatusTicks() (+3 more)

### Community 24 - "WebRTC Manager"
Cohesion: 0.20
Nodes (9): CallQualityStats, fetchIceConfiguration(), WebRTCManager(), getIceServers(), IceServerConfig, WebRTCConfig, sounds, EventHandler (+1 more)

### Community 25 - "Message Handlers"
Cohesion: 0.40
Nodes (8): handleDeleteMessage(), handleEditMessage(), handleSendMessage(), handlePinMessage(), handleReaction(), handleReadReceipt(), handleTyping(), handleMessage()

### Community 26 - "Push Notification Service"
Cohesion: 0.25
Nodes (9): logger, PushNotificationService, PushSubscriptionPayload, connectWebSocket(), isAuthRejection(), readJson(), registerUser(), runE2ETest() (+1 more)

### Community 27 - "Web App Manifest"
Cohesion: 0.14
Nodes (13): background_color, categories, description, display, display_override, icons, id, name (+5 more)

### Community 28 - "Chat List and Stories"
Cohesion: 0.16
Nodes (7): ChatList(), ChatListProps, DEMO_STORIES, StoriesBar(), StoriesBarProps, Story, AndroidInstallerService

### Community 30 - "Cluster Broker Service"
Cohesion: 0.19
Nodes (4): clusterBroker, ClusterEvent, EventListener, PubSubClusterBroker

### Community 32 - "Message Data Models"
Cohesion: 0.20
Nodes (8): MessageRowWithSender, RawMessageRow, MediaMetadata, MessageSummary, MessageType, PollOption, ReceiptStatus, UserSummary

### Community 33 - "Call and Safety Modals"
Cohesion: 0.22
Nodes (7): CallModalProps, MeshRadarModal(), SafetyNumberModal(), SafetyNumberModalProps, WebRTCManagerProps, ActiveCallState, UserSummary

### Community 35 - "Sender Key Service"
Cohesion: 0.29
Nodes (5): BadRequestError, ForbiddenError, SenderKeyService, SenderKeyUpload, StoredSenderKey

### Community 36 - "Root Package Dependencies"
Cohesion: 0.22
Nodes (8): dependencies, pino, description, pino, typescript, name, version, concurrently

### Community 38 - "Chat Header and Status Badge"
Cohesion: 0.32
Nodes (6): ChatHeader(), ChatHeaderProps, UserStatusBadge(), UserStatusBadgeProps, UseRealtimeSubscriptionsParams, TransportMode

### Community 39 - "Message Input and Voice Recorder"
Cohesion: 0.32
Nodes (6): COMMON_EMOJIS, MessageInput(), getSupportedMimeType(), MIME_TYPES, VoiceRecorder(), VoiceRecorderProps

### Community 40 - "End-to-End Encryption Tests"
Cohesion: 0.25
Nodes (3): { chromium }, consoleErrors, failures

### Community 42 - "Project Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, dev:backend, dev:client, sync, test:backend

### Community 43 - "Git Sync Script"
Cohesion: 0.29
Nodes (3): branch, finalStatus, status

### Community 45 - "Schema Consistency Tests"
Cohesion: 0.40
Nodes (4): normalize(), snapshotExists, snapshotPath, statements()

### Community 46 - "E2EE Message Tests"
Cohesion: 0.33
Nodes (3): { chromium }, { DatabaseSync }, failures

### Community 49 - "Dev Dependencies"
Cohesion: 0.50
Nodes (4): devDependencies, concurrently, playwright, typescript

## Knowledge Gaps
- **242 isolated node(s):** `StoredIdentityKey`, `PeerState`, `SelfState`, `ChannelAdminDashboardModalProps`, `LoRaBridgeModalProps` (+237 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 308 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `typescript` connect `Root Package Dependencies` to `Backend Dependencies`, `Frontend Dependencies`?**
  _High betweenness centrality (0.479) - this node is a cross-community bridge._
- **Why does `react` connect `React UI Components` to `Call and Safety Modals`, `Chat Header and Status Badge`, `Frontend Dependencies`, `Message Input and Voice Recorder`, `Mesh Networking UI`, `Logo Components`, `Modal Components`, `Live Wallpaper Service`, `Message and Preview Components`, `WebRTC Manager`, `Chat List and Stories`?**
  _High betweenness centrality (0.248) - this node is a cross-community bridge._
- **Why does `ws` connect `Presence and Chat Service` to `Backend Dependencies`, `AI Messaging Features`, `WebRTC Protocol Types`, `Metrics and Gateway Service`, `Push Notification Service`?**
  _High betweenness centrality (0.207) - this node is a cross-community bridge._
- **What connects `StoredIdentityKey`, `PeerState`, `SelfState` to the rest of the system?**
  _242 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Messaging UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.061938061938061936 - nodes in this community are weakly interconnected._
- **Should `Crypto Utilities` be split into smaller, more focused modules?**
  _Cohesion score 0.07785547785547786 - nodes in this community are weakly interconnected._
- **Should `Backend Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._