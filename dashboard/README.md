# Aether Messaging Platform - Project Dashboard

This dashboard provides comprehensive real-time monitoring of the overall Aether Messaging Platform project status, including health metrics, test status, recent activity, and alerts.

## Features

- **Project Health Overview**: Real-time status of backend, frontend, database, and online users
- **Key Metrics**: Message volume, media uploads, AI requests, and security events
- **Test Suite Status**: Overview of all test suites and their pass/fail status
- **Recent Activity**: Latest git commits and file changes
- **Issues & Alerts**: Detection and notification of potential problems
- **Auto-refresh**: Periodic updates to keep information current

## File Structure

```
dashboard/
├── index.html          # Main dashboard interface
└── README.md           # This file
```

## How to Use

### 1. Open the Dashboard

Simply open `dashboard/index.html` in any modern web browser:

- Double-click the file in your file explorer
- Or drag and drop it into a browser window
- Or open it via file:// URL in your browser's address bar

### 2. Dashboard Sections

#### Project Health Overview
Shows the real-time status of critical components:
- **Backend Status**: Health of the Node.js/TypeScript backend server
- **Frontend Status**: Status of the React/Vite frontend development server
- **Database Health**: Connection status of the SQLite database
- **Online Users**: Current number of connected users

#### Key Metrics
Important performance and usage metrics:
- **Messages Sent (24h)**: Total messages sent in the last 24 hours
- **Media Uploads (24h)**: Media files uploaded in the last 24 hours
- **AI Requests (24h)**: AI service requests in the last 24 hours
- **Security Events (24h)**: Security-related events in the last 24 hours

#### Test Suite Status
Overview of all automated test suites:
- Schema Consistency Tests
- Security Audit Suite
- Comprehensive Test Suite
- Cross-Platform Sync Suite
- E2E Tests
- E2E Encryption Tests

Each test suite shows pass/fail status with an overall pass rate.

#### Recent Activity
Latest development activity:
- Recent git commits with messages and authors
- File change counts per commit
- Timestamps of activities

#### Issues & Alerts
Automatic detection of potential problems:
- Failed test suites
- Backend/frontend connectivity issues
- Database connection problems
- Performance threshold violations
- Security alerts

### 3. Automatic Updates

The dashboard automatically refreshes every 5 seconds to show:
- Latest health status from backend APIs
- Updated test results
- Recent git activity
- Current issue status

### 4. Customization

To adjust the refresh interval, edit the `REFRESH_INTERVAL` constant in the JavaScript section of `index.html`:
```javascript
const REFRESH_INTERVAL = 5000; // milliseconds (5 seconds)
```

To change the backend URL if running on a different port or host, modify the `BACKEND_URL` constant:
```javascript
const BACKEND_URL = 'http://localhost:4000'; // Update as needed
```

## Technical Details

The dashboard is a self-contained HTML file that uses:
- Tailwind CSS for styling (loaded via CDN)
- Font Awesome for icons (loaded via CDN)
- Vanilla JavaScript for functionality
- Fetch API to communicate with backend services
- No external dependencies or build process required

## Data Sources

The dashboard gathers information from:

1. **Backend Health Endpoints**:
   - `GET /api/health` - Overall backend status and user count
   - `GET /api/ready` - Database readiness check
   - `GET /api/metrics` - Prometheus-style metrics for detailed statistics

2. **Git Repository**:
   - Recent commits and file changes (simulated in current version)

3. **Test Suite Status**:
   - Based on available test files in the repository (simulated in current version)

4. **Issue Detection**:
   - Automatic analysis of health status, test results, and repository state

## Required Backend Endpoints

For full functionality, the backend should provide these endpoints:

1. **Health Check** (`GET /api/health`):
```json
{
  "status": "ok",
  "timestamp": "2026-09-18T10:30:00Z",
  "onlineUsersCount": 42
}
```

2. **Readiness Check** (`GET /api/ready`):
```json
{
  "status": "ready",
  "database": "connected",
  "timestamp": "2026-09-18T10:30:00Z"
}
```

3. **Metrics** (`GET /api/metrics`):
```
# HELP messages_sent_total Total number of messages sent
# TYPE messages_sent_total counter
messages_sent_total 1250
# HELP media_uploads_total Total number of media uploads
# TYPE media_uploads_total counter
media_uploads_total 89
# HELP ai_requests_total Total number of AI requests
# TYPE ai_requests_total counter
ai_requests_total 234
# HELP security_events_total Total number of security events
# TYPE security_events_total counter
security_events_total 2
```

## Supported Browsers

The dashboard works in all modern browsers:
- Chrome (recommended)
- Firefox
- Safari
- Edge
- Any browser supporting ES6+ and CSS Grid/Flexbox

## Project Components Monitored

The dashboard tracks the health and status of these key project areas:

1. **Backend Services**:
   - HTTP API server (Express.js)
   - WebSocket gateway
   - Authentication service
   - Message service
   - Media service
   - AI service
   - Presence tracking
   - All microservices

2. **Frontend Application**:
   - React/Vite application
   - State management
   - UI components
   - WebSocket client
   - Service workers

3. **Infrastructure**:
   - Database connectivity
   - File system access
   - Network services
   - Third-party API integrations

4. **Quality Gates**:
   - Automated test suites
   - Code quality checks
   - Security scans
   - Performance benchmarks

## Troubleshooting

### Dashboard Shows Backend as Unreachable

1. Verify the backend server is running:
   ```bash
   cd backend && npm run dev
   ```

2. Check if the backend is accessible on the expected port (default: 4000)

3. Verify network connectivity and firewall settings

### Dashboard Shows Frontend as Not Running

1. Start the frontend development server:
   ```bash
   cd client && npm run dev
   ```

2. The frontend should be accessible on http://localhost:3000

### No Data in Metrics Sections

1. Ensure the backend is running and accessible
2. Verify the `/api/metrics` endpoint is implemented and returning data
3. Check browser console for fetch errors

### Stale Information

1. The dashboard automatically refreshes every 5 seconds
2. To force an update, refresh the browser page
3. Check that JavaScript is enabled in your browser

## Extending the Dashboard

To add new monitoring capabilities:

1. **New Health Metrics**: Add fetch calls to new backend endpoints in `fetchProjectHealth()`
2. **Additional Test Suites**: Update the test suites array in `fetchTestStatus()`
3. **Custom Alerts**: Add new issue detection logic in `fetchIssues()`
4. **New Activity Sources**: Integrate with CI/CD systems or issue trackers in `fetchRecentActivity()`

## Security Considerations

- The dashboard only makes read-only requests to backend endpoints
- No sensitive data is displayed or stored
- All communication happens over HTTP (consider HTTPS in production)
- The dashboard should be treated as a development/operations tool