# TODO — Future Enhancements & Technical Debt

## Summary
This document outlines suggested improvements, technical debt items, and feature enhancements for the Aether messaging platform based on code review analysis.

---

## 🚀 Priority Enhancements (P0-P1)

### P0 — Scalability & Production Readiness
- [ ] **Replace in-memory stores with Redis-backed storage**
  - pollsStore and viewsStore currently use Map instances - won't scale across multiple server instances
  - Implement Redis-backed polling and view tracking services
  - Add graceful fallback to in-memory for development

- [ ] **Implement database connection pooling**
  - Current SQLite usage may bottleneck under load
  - Consider migrating to PostgreSQL for production with proper connection pooling
  - Add database connection monitoring and health checks

- [ ] **Add rate limiting to WebSocket connections**
  - Current rate limiter only applies to authenticated frames
  - Implement connection-level rate limiting to prevent abuse
  - Add IP-based throttling for initial connections

### P1 — Developer Experience & Maintainability
- [ ] **Improve TypeScript typing throughout codebase**
  - Replace `any` types with proper interfaces
  - Add JSDoc comments to all public methods
  - Implement strict null checking

- [ ] **Extract common service patterns into base classes**
  - Services have repetitive database query patterns
  - Create BaseService with common CRUD operations
  - Standardize error handling across services

- [ ] **Implement comprehensive logging framework**
  - Replace console.log with structured logging (winston/pino)
  - Add correlation IDs for request tracing
  - Implement log levels and rotation

---

## ⚙️ Technical Debt (P2)

### P2 — Code Quality & Refactoring
- [ ] **Split large files into smaller modules**
  - gateway.ts is quite large - consider splitting by concern (auth, messaging, presence, webrtc)
  - message.service.ts could benefit from separation of concerns
  - Move WebSocket frame types to separate file

- [ ] **Implement dependency injection**
  - Services currently import each other directly creating tight coupling
  - Consider implementing a simple DI container
  - Improve testability through interface-based dependencies

- [ ] **Standardize error response formats**
  - WebSocket error responses use inconsistent formats
  - HTTP API responses could benefit from standardized error envelopes
  - Add error codes and detailed messages

### P2 — Database & Data Layer
- [ ] **Add database migration system**
  - Current schema.sql is static - need migration system for production updates
  - Implement using Knex.js or similar
  - Add seed data management

- [ ] **Optimize database queries**
  - Add indices on frequently queried columns (chat_id, sender_id, created_at)
  - Implement query caching for read-heavy operations
  - Add database query monitoring and slow query logging

- [ ] **Implement soft delete with archiving**
  - Current is_deleted flag - consider moving deleted messages to archive table
  - Add data retention policies
  - Implement GDPR-compliant data export/delete

---

## 💡 Feature Enhancements (P3)

### P3 — Messaging Features
- [ ] **Advanced message search**
  - Full-text search capabilities
  - Filter by sender, date range, message type
  - Search within specific chats or across all chats

- [ ] **Message reactions UI improvements**
  - Show recent reactors (last 3 users)
  - Add reaction animations
  - Implement quick reaction toolbar

- [ ] **Scheduled messages**
  - Allow users to schedule messages for future delivery
  - Add cron-like scheduling interface
  - Handle timezone conversions properly

- [ ] **Message threading improvements**
  - Better UI for following threads
  - Thread notifications and muting
  - Thread search and filtering

- [ ] **Message translation**
  - Integrate translation API for real-time message translation
  - Per-message language detection
  - User language preferences

### P3 — Chat & Group Features
- [ ] **Chat analytics dashboard**
  - Message frequency over time
  - Active user tracking
  - Engagement metrics

- [ ] **Advanced group management**
  - Role-based permissions (admin, moderator, member)
  - Group invites with expiration
  - Group welcome messages and rules

- [ ] **Chat folders/labels**
  - Allow users to organize chats into custom folders
  - Chat archiving and muting per folder
  - Smart folders (unread, pinned, groups, etc.)

### P3 — Media & Rich Content
- [ ] **Enhanced media sharing**
  - Image preview and annotation tools
  - Video trimming and compression
  - File versioning for re-sent media

- [ ] **Rich link previews**
  - Extract metadata from shared URLs
  - Open Graph / Twitter Card support
  - Preview caching and refresh mechanism

- [ ] **Poll enhancements**
  - Anonymous polling option
  - Poll scheduling and expiration
  - Poll results visualization (charts)

---

## 🔧 DevOps & Infrastructure (P4)

### P4 — Deployment & Monitoring
- [ ] **Implement comprehensive health checks**
  - Liveness and readiness probes for Kubernetes
  - Dependency health checks (database, Redis, external APIs)
  - Health check endpoint with detailed status

- [ ] **Add distributed tracing**
  - OpenTelemetry integration for request tracing
  - Trace WebSocket message flow across services
  - Integrate with monitoring solution (Jaeger, Zipkin)

- [ ] **Implement feature flags**
  - Launchdarkly or similar for gradual rollouts
  - A/B testing framework for UI changes
  - Emergency kill switches for problematic features

### P4 — Testing & Quality Assurance
- [ ] **Expand test coverage**
  - Add property-based testing for critical algorithms
  - Implement contract testing between services
  - Add chaos engineering tests for failure scenarios

- [ ] **Performance benchmarking suite**
  - Load testing for WebSocket connections
  - Database query performance benchmarks
  - API response time monitoring and alerts

- [ ] **Cross-browser compatibility testing**
  - Automated testing for WebRTC across browsers
  - Mobile responsive testing
  - Accessibility testing (WCAG compliance)

---

## 📋 Completed Items (Reference)
See TODO.md for previously completed work items (P0-P4 all marked as resolved).

---

## 🎯 Next Steps
1. Review this TODO-NEW.md with team stakeholders
2. Prioritize items based on business goals and technical impact
3. Create implementation tickets for selected high-priority items
4. Establish Definition of Done for each item (including tests, documentation, monitoring)

*Last updated: 2026-08-31*