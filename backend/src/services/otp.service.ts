import crypto from 'node:crypto';

interface OTPEntry {
  otp: string;
  timestamp: number;
  attempts: number;
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

  static sendOTP(identifier: string, otp: string): void {
    // In a real implementation, integrate with SMS/email provider.
    // For development, we log the OTP.
    console.log(`[OTP] OTP for ${identifier}: ${otp}`);
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