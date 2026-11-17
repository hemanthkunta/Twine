# Free SMS / OTP Setup (No Paid Provider Required)

This document explains how to develop and test the phone OTP flow **without any paid SMS provider** (Twilio, Vonage, etc.). The platform includes a built-in free development mode that works out of the box.

---

## Quick Start: Zero-Config Free Mode

**No configuration needed.** Just run the backend:

```bash
cd backend
npm run dev
```

That's it. The OTP flow works immediately in development:

1. Open the app at `http://localhost:3000`
2. Click **"Phone OTP"** tab
3. Enter any phone number (e.g., `+15551234567`)
4. Click **"Send Verification Code"**
5. The **6-digit code appears in the UI** with an **"Autofill"** button
6. Click **Autofill** → **Verify & Sign In**

No Twilio account, no Vonage account, no credit card, no phone number verification.

---

## How It Works

### Backend: Dev-Mode Echo (`SMS_PROVIDER=test`)

When `NODE_ENV !== 'production'` and no `SMS_PROVIDER` is set, the backend automatically uses the **TestProvider** (`backend/src/services/otp.service.ts`):

```typescript
// OtpService.sendOTP() → TestProvider.send()
// Logs to console: [OTP] OTP for +15551234567: 123456
// Returns the code in the API response as `devCode`
```

**AuthService.requestOTP()** returns:

```json
{
  "phoneNumber": "+15551234567",
  "expiresInSeconds": 300,
  "resendAfterSeconds": 30,
  "devCode": "123456"   // ← Only in non-production!
}
```

### Frontend: Auto-Fill Button

In `client/src/components/AuthModal.tsx`, the Phone OTP tab displays:

```
┌─────────────────────────────────────┐
│ Dev code:  1 2 3 4 5 6    [Autofill] │
└─────────────────────────────────────┘
```

Clicking **Autofill** populates the verification code input instantly.

---

## Option 2: Local Webhook Server (For Realistic E2E Testing)

If you want to test the **actual webhook delivery path** (what production uses), run the included webhook server:

### 1. Start the Webhook Server

```bash
# Terminal 1 (from project root)
npm run dev:webhook
# → "Webhook server listening on http://localhost:8080/otp"
```

Or directly:

```bash
node webhook-server.mjs
```

### 2. Configure Backend to Use Webhook

```bash
# Terminal 2
cd backend
# Create .env or export:
export SMS_PROVIDER=webhook
export SMS_WEBHOOK_URL=http://localhost:8080/otp
npm run dev
```

### 3. Test the Full Webhook Flow

1. Open `http://localhost:3000` → Phone OTP tab
2. Enter phone number → Send Verification Code
3. Check **Terminal 1** — you'll see the full webhook payload:

```
=== WEBHOOK RECEIVED ===
Method: POST
Headers: { "content-type": "application/json", ... }
Body: { "to": "+15551234567", "message": "Your verification code is: 847291. Valid for 5 minutes." }
========================
```

4. The **devCode still appears in the UI** (backend echoes it for convenience)
5. Click Autofill → Verify & Sign In

### 4. Customize Webhook (Optional)

```bash
# Custom headers (e.g., for auth)
export SMS_WEBHOOK_HEADERS='{"Authorization": "Bearer my-secret", "Content-Type": "application/json"}'

# Custom HTTP method
export SMS_WEBHOOK_METHOD=POST

# HMAC signing (for production-like security)
export SMS_WEBHOOK_HMAC_SECRET=super-secret-key
```

The webhook server (`webhook-server.mjs`) accepts **any** POST/GET to `/otp` and logs everything — perfect for inspecting payloads during development.

---

## Option 3: SMS_PROVIDER=test (Explicit Test Mode)

If you want to be explicit about using the test provider:

```bash
export SMS_PROVIDER=test
npm run dev
```

This behaves identically to the default (no provider set) but makes the choice explicit in logs.

---

## Production: When You Need Real SMS

**Only in production** (`NODE_ENV=production`) is a real provider **required**. The app will **refuse to start** without one:

```bash
# Production .env example:
NODE_ENV=production
SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+15551234567

# Or Vonage:
SMS_PROVIDER=vonage
VONAGE_API_KEY=your_key
VONAGE_API_SECRET=your_secret
VONAGE_FROM_NUMBER=+15551234567

# Or your own webhook endpoint:
SMS_PROVIDER=webhook
SMS_WEBHOOK_URL=https://your-api.com/sms-webhook
SMS_WEBHOOK_HMAC_SECRET=production-secret
```

**Supported production providers:**
| Provider | Environment Variables |
|----------|----------------------|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Vonage (Nexmo) | `VONAGE_API_KEY`, `VONAGE_API_SECRET`, `VONAGE_FROM_NUMBER` |
| Custom Webhook | `SMS_WEBHOOK_URL`, `SMS_WEBHOOK_HEADERS`, `SMS_WEBHOOK_METHOD`, `SMS_WEBHOOK_HMAC_SECRET` |

---

## Testing Checklist (All Free)

| Scenario | Command | Cost |
|----------|---------|------|
| Basic OTP flow (devCode in UI) | `npm run dev` | **Free** |
| OTP regression tests | `npm run test:otp` | **Free** |
| Full E2E auth tests (needs running server) | `npm run test:phase1` | **Free** |
| Webhook payload inspection | `npm run dev:webhook` + `SMS_PROVIDER=webhook` | **Free** |
| Load test OTP endpoints | Any load tool against `/auth/request-otp` | **Free** |

---

## Architecture Summary

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   Backend API    │────▶│  SMS Provider   │
│  (AuthModal)    │     │  (AuthService)   │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                              ┌───────────────────────────┘
                              ▼
                    ┌───────────────────────┐
                    │  Dev / Test Modes     │
                    │  (NO COST)            │
                    │  • TestProvider       │
                    │    → console.log()    │
                    │    → returns devCode  │
                    │  • WebhookProvider    │
                    │    → localhost:8080   │
                    │    → devCode echoed   │
                    └───────────────────────┘
                              │
                              ▼ (production only)
                    ┌───────────────────────┐
                    │  Paid Providers       │
                    │  • Twilio             │
                    │  • Vonage             │
                    │  • Your Webhook       │
                    └───────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/otp.service.ts` | OTP generation, storage, verification, provider abstraction |
| `backend/src/services/auth.service.ts` | `requestOTP()` / `verifyOTPAndSignIn()` — devCode echo logic |
| `backend/src/config/index.ts` | SMS provider configuration loading |
| `client/src/components/AuthModal.tsx` | Phone OTP UI — devCode display + Autofill button |
| `webhook-server.mjs` | Standalone webhook receiver for local testing |
| `backend/src/test/otp_flow.test.ts` | Automated OTP regression suite (`npm run test:otp`) |

---

## Troubleshooting

### "SMS provider is not configured"
- **Cause:** `NODE_ENV=production` but no `SMS_PROVIDER` set
- **Fix:** Set `NODE_ENV=development` or configure a provider

### "SMS_PROVIDER=none is not allowed"
- **Cause:** Explicitly set `SMS_PROVIDER=none`
- **Fix:** Remove it or use `test` / `webhook` / `twilio` / `vonage`

### DevCode not appearing in UI
- **Cause:** Backend thinks it's production (`NODE_ENV=production`)
- **Fix:** Ensure `NODE_ENV` is unset or `development`

### Webhook not receiving requests
- **Cause:** Wrong `SMS_WEBHOOK_URL` or backend not restarted
- **Fix:** Check URL, restart backend, verify webhook server is running on 8080

### OTP expires too fast / cooldown issues
- **Constants in `otp.service.ts`:**
  - `OTP_EXPIRY_TIME = 5 minutes`
  - `RESEND_COOLDOWN_TIME = 30 seconds`
- **Tests use clock freezing** — see `otp_flow.test.ts` for time manipulation patterns

---

## Security Notes

- **`devCode` is ONLY returned when `config.isProduction === false`** (line 706 in `auth.service.ts`)
- Production deployments **can never leak** OTP codes via the API
- The webhook provider supports **HMAC-SHA256 signing** (`SMS_WEBHOOK_HMAC_SECRET`) for production use
- OTP codes are **one-time use** — verified then deleted
- **Brute-force protection:** 5 wrong attempts → code invalidated
- **Resend cooldown:** 30 seconds per phone number

---

## Summary

| Environment | SMS_PROVIDER | Cost | How Code Is Delivered |
|-------------|--------------|------|----------------------|
| Development (default) | *(auto: test)* | **Free** | Console log + `devCode` in API response + Autofill button |
| Development (explicit) | `test` | **Free** | Console log + `devCode` in API response |
| Development (webhook) | `webhook` → `localhost:8080` | **Free** | Webhook payload + `devCode` in API response |
| **Production** | `twilio` \| `vonage` \| `webhook` | **Paid** | Real SMS / Your webhook endpoint (no `devCode`) |

**You can develop, test, and CI the entire OTP flow without ever creating a Twilio or Vonage account.**