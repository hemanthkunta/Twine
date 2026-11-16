import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { getLogger } from './logger.service.js';

const logger = getLogger();

interface OTPEntry {
    otp: string;
    timestamp: number;
    attempts: number;
}

interface SMSProvider {
    send(to: string, message: string): Promise<void>;
}

class TwilioProvider implements SMSProvider {
    private accountSid: string;
    private authToken: string;
    private fromNumber: string;

    constructor(accountSid: string, authToken: string, fromNumber: string) {
        this.accountSid = accountSid;
        this.authToken = authToken;
        this.fromNumber = fromNumber;
    }

    async send(to: string, message: string): Promise<void> {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
        const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
        const body = new URLSearchParams({
            To: to,
            From: this.fromNumber,
            Body: message,
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Twilio API error: ${response.status} - ${error}`);
        }
    }
}

class VonageProvider implements SMSProvider {
    private apiKey: string;
    private apiSecret: string;
    private fromNumber: string;

    constructor(apiKey: string, apiSecret: string, fromNumber: string) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.fromNumber = fromNumber;
    }

    async send(to: string, message: string): Promise<void> {
        const url = 'https://rest.nexmo.com/sms/json';
        const body = new URLSearchParams({
            api_key: this.apiKey,
            api_secret: this.apiSecret,
            to: to,
            from: this.fromNumber,
            text: message,
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Vonage API error: ${response.status} - ${error}`);
        }

        const result = await response.json() as { messages?: Array<{ status?: string; 'error-text'?: string }> };
        if (result.messages?.[0]?.status !== '0') {
            throw new Error(`Vonage delivery failed: ${result.messages?.[0]?.['error-text'] || 'Unknown error'}`);
        }
    }
}

class WebhookProvider implements SMSProvider {
    private webhookUrl: string;
    private headers: Record<string, string>;
    private method: string;
    private hmacSecret: string | undefined;

    constructor(webhookUrl: string, headers?: Record<string, string>, method = 'POST', hmacSecret?: string) {
        this.webhookUrl = webhookUrl;
        this.headers = headers || { 'Content-Type': 'application/json' };
        this.method = method;
        this.hmacSecret = hmacSecret;
    }

    private async signPayload(payload: string): Promise<string> {
        if (!this.hmacSecret) return '';
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(this.hmacSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
        return Buffer.from(signature).toString('hex');
    }

    async send(to: string, message: string): Promise<void> {
        const payload = { to, message };
        const body = this.headers['Content-Type']?.includes('json')
            ? JSON.stringify(payload)
            : new URLSearchParams(payload).toString();

        // Add HMAC signature if secret is configured
        const requestHeaders = { ...this.headers };
        if (this.hmacSecret) {
            const signature = await this.signPayload(body);
            requestHeaders['X-Signature'] = `sha256=${signature}`;
        }

        const response = await fetch(this.webhookUrl, {
            method: this.method,
            headers: requestHeaders,
            body,
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`SMS webhook error: ${response.status} - ${error}`);
        }
    }
}

/**
 * Test-only SMS provider that logs OTPs to console.
 * Only available when NODE_ENV=test or SMS_PROVIDER=test.
 */
class TestProvider implements SMSProvider {
    async send(to: string, message: string): Promise<void> {
        console.log(`[OTP] OTP for ${to}: ${message.match(/\d{6}/)?.[0] || 'unknown'}`);
    }
}

function createSMSProvider(): SMSProvider {
    // Read SMS_PROVIDER directly from process.env at runtime to allow test overrides
    const smsProvider = process.env.SMS_PROVIDER;
    const isProduction = process.env.NODE_ENV === 'production';

    // SMS_PROVIDER=none is not allowed in any environment.
    if (smsProvider === 'none') {
        throw new Error('SMS_PROVIDER=none is not allowed. Configure twilio, vonage, webhook, or test.');
    }

    // Outside production, fall back to the console-logging provider so the OTP
    // flow stays usable before a real SMS provider is wired up. In production
    // an explicit provider is mandatory.
    if (!smsProvider) {
        if (isProduction) {
            throw new Error('SMS_PROVIDER is required in production. Configure twilio, vonage, or webhook.');
        }
        return new TestProvider();
    }

    switch (smsProvider) {
        case 'twilio':
            if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioFromNumber) {
                throw new Error('Twilio config incomplete: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER required');
            }
            return new TwilioProvider(config.twilioAccountSid, config.twilioAuthToken, config.twilioFromNumber);

        case 'vonage':
            if (!config.vonageApiKey || !config.vonageApiSecret || !config.vonageFromNumber) {
                throw new Error('Vonage config incomplete: VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM_NUMBER required');
            }
            return new VonageProvider(config.vonageApiKey, config.vonageApiSecret, config.vonageFromNumber);

        case 'webhook':
            if (!config.smsWebhookUrl) {
                throw new Error('Webhook config incomplete: SMS_WEBHOOK_URL required');
            }
            return new WebhookProvider(config.smsWebhookUrl, config.smsWebhookHeaders, config.smsWebhookMethod, config.smsWebhookHmacSecret);

        case 'test':
            // Test provider only allowed in non-production
            if (isProduction) {
                throw new Error('SMS_PROVIDER=test not allowed in production');
            }
            return new TestProvider();

        default:
            throw new Error(`Unknown SMS_PROVIDER: ${smsProvider}. Supported: twilio, vonage, webhook, test`);
    }
}

let smsProvider: SMSProvider | null | 'uninitialized' = 'uninitialized';

function getSMSProvider(): SMSProvider | null {
    if (smsProvider === 'uninitialized') {
        smsProvider = createSMSProvider();
    }
    return smsProvider;
}

export class OTPService {
    private static store = new Map<string, OTPEntry>();
    /** Public so callers can report the same validity window to their clients. */
    static readonly OTP_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds
    /** A code is burned after this many wrong guesses, to stop 6-digit brute forcing. */
    private static readonly MAX_VERIFY_ATTEMPTS = 5;
    /** Public so callers can report the same cooldown to their clients. */
    static readonly RESEND_COOLDOWN_TIME = 30 * 1000;

    static generateOTP(): string {
        // crypto.randomInt is uniform (Math.random() * 900000 biases low digits) and
        // uses the same RNG the rest of the auth stack already relies on.
        return crypto.randomInt(100000, 1000000).toString();
    }

    static storeOTP(identifier: string, otp: string): void {
        this.store.set(identifier, { otp, timestamp: Date.now(), attempts: 0 });
        // Optional: clean expired entries
        this.cleanExpired();
    }

    /**
     * Consume an OTP.
     *
     * A successful verification deletes the code so it can never be replayed, while
     * a failed one counts towards MAX_VERIFY_ATTEMPTS so a caller cannot enumerate
     * the 1,000,000 possible codes before the 5-minute expiry.
     */
    static verifyOTP(identifier: string, otp: string): boolean {
        const entry = this.store.get(identifier);
        if (!entry) return false;

        const now = Date.now();
        if (now - entry.timestamp > this.OTP_EXPIRY_TIME) {
            this.store.delete(identifier);
            return false;
        }

        entry.attempts += 1;
        if (entry.attempts > this.MAX_VERIFY_ATTEMPTS) {
            this.store.delete(identifier);
            return false;
        }

        const expected = Buffer.from(entry.otp, 'utf8');
        const provided = Buffer.from(String(otp), 'utf8');
        const matches =
            expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
        if (!matches) {
            return false;
        }

        // One-time use: burn the code on success.
        this.store.delete(identifier);
        return true;
    }

    /**
     * Seconds the caller must still wait before another code may be sent, or 0 when
     * a new code can be issued immediately.
     */
    static getResendCooldownSeconds(identifier: string): number {
        const entry = this.store.get(identifier);
        if (!entry) return 0;

        const elapsed = Date.now() - entry.timestamp;
        if (elapsed >= this.OTP_EXPIRY_TIME) return 0;

        const remaining = this.RESEND_COOLDOWN_TIME - elapsed;
        return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
    }

    /**
     * Read the currently valid code without consuming it.
     *
     * Only used by the dev-mode echo in AuthService so the OTP flow can be driven
     * without an SMS provider. Callers must gate this on `!config.isProduction`.
     */
    static peekOTP(identifier: string): string | null {
        const entry = this.store.get(identifier);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.OTP_EXPIRY_TIME) return null;
        return entry.otp;
    }

    static async sendOTP(identifier: string, otp: string): Promise<void> {
        const message = `Your verification code is: ${otp}. Valid for 5 minutes.`;

        const provider = getSMSProvider();
        if (!provider) {
            logger.error({ identifier }, 'No SMS provider configured; cannot send OTP');
            throw new Error('SMS provider is not configured');
        }
        try {
            await provider.send(identifier, message);
            logger.info({ identifier }, 'OTP sent via SMS provider');
        } catch (error) {
            // A failed provider request must not leave a usable code or cooldown.
            if (this.store.get(identifier)?.otp === otp) this.store.delete(identifier);
            logger.error({ err: error, identifier }, 'Failed to send OTP via SMS provider');
            throw new Error(`Failed to send OTP: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private static cleanExpired(): void {
        const now = Date.now();
        for (const [identifier, entry] of this.store.entries()) {
            if (now - entry.timestamp > this.OTP_EXPIRY_TIME) {
                this.store.delete(identifier);
            }
        }
    }
}
