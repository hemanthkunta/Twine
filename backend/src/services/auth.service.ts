import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { BaseService } from './base.service.js';
import { OTPService } from './otp.service.js';
import { config } from '../config/index.js';
import { User, UserSession, UserSummary } from '../types/protocol.js';
import { generateSecret, verifySync, generateURI } from 'otplib';
import QRCode from 'qrcode';

export interface AccessTokenPayload {
    id: string;
    username: string | null;
    phone_number: string;
    session_id: string;
}

/** Which kind of second factor a login challenge accepts. */
export type TwoFactorMethod = 'totp' | 'backup';

export interface TwoFactorStatus {
    enabled: boolean;
    enabledAt: string | null;
    backupCodesRemaining: number;
    /** A setup was started but not confirmed yet: 2FA is NOT active. */
    pending: boolean;
}

/**
 * A completed sign-in. `token` is the historical field name used across the
 * codebase; `accessToken` is an alias so clients can use either spelling.
 */
export interface SessionSignIn {
    user: User;
    token: string;
    accessToken: string;
    sessionId: string;
    refreshToken: string;
    twofa?: TwoFactorStatus;
}

/** Returned instead of a session when the account has 2FA enabled. */
export interface TwoFactorChallenge {
    requiresTwoFactor: true;
    challengeId: string;
    method: TwoFactorMethod;
}

export type SignInOutcome =
    | { kind: 'session'; session: SessionSignIn }
    | { kind: 'challenge'; challenge: TwoFactorChallenge };

export class AuthService {
    /**
     * Create a short-lived access token bound to a database session.
     */
    static generateToken(user: User, sessionId: string): string {
        return (jwt.sign as any)(
            {
                id: user.id,
                username: user.username,
                phone_number: user.phone_number,
                session_id: sessionId,
            },
            config.jwtSecret,
            {
                expiresIn: config.accessTokenExpiresIn,
            }
        );
    }

    static generateRefreshToken(): string {
        return crypto.randomBytes(48).toString('base64url');
    }

    static hashRefreshToken(refreshToken: string): string {
        return crypto.createHash('sha256').update(refreshToken).digest('hex');
    }

    /**
     * Verify JWT signature and expiration.
     */
    static verifyToken(token: string): AccessTokenPayload | null {
        try {
            const payload = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;

            if (
                !payload ||
                typeof payload.id !== 'string' ||
                typeof payload.session_id !== 'string'
            ) {
                return null;
            }

            return payload;
        } catch {
            return null;
        }
    }

    /**
     * Verify that the JWT's database session still exists and has not
     * been revoked.
     */
    static isSessionValid(sessionId: string, userId: string): boolean {
        const session = BaseService.queryOne<{ id: string }>(
            `
            SELECT id
            FROM user_sessions
            WHERE id = ?
              AND user_id = ?
              AND is_revoked = 0
            LIMIT 1
            `,
            [sessionId, userId]
        );

        return Boolean(session);
    }

    /**
     * Update the activity timestamp of an authenticated session.
     */
    static touchSession(sessionId: string, userId: string): void {
        db.prepare(
            `
            UPDATE user_sessions
            SET last_active_at = datetime('now')
            WHERE id = ?
              AND user_id = ?
              AND is_revoked = 0
            `
        ).run(sessionId, userId);
    }

    static register(params: {
        phoneNumber: string;
        username: string;
        displayName: string;
        password?: string;
        bio?: string;
        avatarUrl?: string;
        deviceName?: string;
        deviceType?: string;
        ipAddress?: string;
    }): {
        user: User;
        token: string;
        sessionId: string;
        refreshToken: string;
    } {
        const normalizedUsername = params.username.trim().toLowerCase();
        const normalizedPhone = params.phoneNumber.trim();

        const existing = db
            .prepare('SELECT * FROM users WHERE phone_number = ? OR username = ?')
            .get(normalizedPhone, normalizedUsername) as User | undefined;

        if (existing) {
            if (existing.phone_number === normalizedPhone) {
                throw new Error('Phone number already registered');
            }

            throw new Error('Username already taken');
        }

        if (!params.password || params.password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

        const passwordHash = bcrypt.hashSync(params.password, 12);

        const avatarUrl =
            params.avatarUrl ||
            `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                normalizedUsername
            )}`;

        db.prepare(
            `
        INSERT INTO users (
            id,
            phone_number,
            username,
            display_name,
            bio,
            avatar_url,
            password_hash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
            userId,
            normalizedPhone,
            normalizedUsername,
            params.displayName.trim(),
            params.bio || '',
            avatarUrl,
            passwordHash
        );

        const user = this.getUserById(userId);

        if (!user) {
            throw new Error('Failed to create user');
        }

        const session = this.createSession(
            userId,
            params.deviceName || 'Web Browser',
            params.deviceType || 'web',
            params.ipAddress
        );

        const token = this.generateToken(user, session.sessionId);

        return {
            user,
            token,
            sessionId: session.sessionId,
            refreshToken: session.refreshToken,
        };
    }

    static login(
        identifier: string,
        password: string,
        options?: {
            deviceName?: string;
            deviceType?: string;
            ipAddress?: string;
        }
    ): SessionSignIn {
        const outcome = this.loginWithTwoFactor(identifier, password, options);

        if (outcome.kind === 'challenge') {
            throw new Error('Two-factor authentication required');
        }

        return outcome.session;
    }

    /**
     * Password sign-in that defers session creation when 2FA is enabled.
     *
     * When the account has 2FA active no session and no token are created:
     * the caller receives a short-lived challenge that must be completed with
     * a TOTP code or a backup code before any credential is issued.
     */
    static loginWithTwoFactor(
        identifier: string,
        password: string,
        options?: {
            deviceName?: string;
            deviceType?: string;
            ipAddress?: string;
        }
    ): SignInOutcome {
        const normalized = identifier.trim().toLowerCase();

        const user = db
            .prepare(
                `
            SELECT *
            FROM users
            WHERE LOWER(username) = ?
               OR phone_number = ?
            LIMIT 1
            `
            )
            .get(normalized, identifier.trim()) as
            | (User & { password_hash?: string | null })
            | undefined;

        if (!user) {
            throw new Error('Invalid credentials');
        }

        if (!user.password_hash) {
            throw new Error('Password authentication is not configured for this account');
        }

        const isValid = bcrypt.compareSync(password, user.password_hash);

        if (!isValid) {
            throw new Error('Invalid credentials');
        }

        const cleanUser = this.getUserById(user.id);

        if (!cleanUser) {
            throw new Error('User account no longer exists');
        }

        if (this.is2FAEnabled(cleanUser.id)) {
            return {
                kind: 'challenge',
                challenge: this.createTwoFactorChallenge(cleanUser.id, 'password', {
                    deviceName: options?.deviceName || 'Web Browser',
                    deviceType: options?.deviceType || 'web',
                    ipAddress: options?.ipAddress,
                }),
            };
        }

        const session = this.createSession(
            cleanUser.id,
            options?.deviceName || 'Web Browser',
            options?.deviceType || 'web',
            options?.ipAddress
        );

        const token = this.generateToken(cleanUser, session.sessionId);

        return {
            kind: 'session',
            session: {
                user: cleanUser,
                token,
                accessToken: token,
                sessionId: session.sessionId,
                refreshToken: session.refreshToken,
            },
        };
    }

    static loginWithPassword(
        identifier: string,
        password: string,
        options?: {
            deviceName?: string;
            deviceType?: string;
            ipAddress?: string;
        }
    ): SessionSignIn {
        return this.login(identifier, password, options);
    }

    /**
     * Demo login is retained temporarily so we don't break the existing
     * development UI. It must be removed/disabled before production.
     */
    static demoLogin(userId: string): {
        user: User;
        token: string;
        sessionId: string;
        refreshToken: string;
    } {
        const user = this.getUserById(userId);

        if (!user) {
            throw new Error('Demo user not found');
        }

        const session = this.createSession(userId, 'Desktop Client', 'desktop');

        const token = this.generateToken(user, session.sessionId);

        return {
            user,
            token,
            sessionId: session.sessionId,
            refreshToken: session.refreshToken,
        };
    }

    static getUserById(id: string): User | null {
        const row = BaseService.queryOne<User>(
            `
            SELECT
                id,
                phone_number,
                username,
                display_name,
                bio,
                avatar_url,
                is_2fa_enabled,
                is_bot,
                last_seen_at,
                created_at,
                updated_at
            FROM users
            WHERE id = ?
            `,
            [id]
        );

        if (!row) {
            return null;
        }

        return {
            ...row,
            is_bot: Boolean(row.is_bot),
        };
    }

    static updateProfile(
        userId: string,
        params: {
            displayName?: string;
            bio?: string;
            avatarUrl?: string;
            username?: string;
        }
    ): User {
        if (params.avatarUrl?.startsWith('/uploads/')) {
            const owned = db.prepare('SELECT 1 FROM media_upload_owners WHERE media_url = ? AND user_id = ?')
                .get(params.avatarUrl, userId);
            if (!owned) throw new Error('Avatar must be one of your uploads');
        }
        if (params.username) {
            const normalizedUsername = params.username.trim().toLowerCase();

            const existing = db
                .prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?')
                .get(normalizedUsername, userId);

            if (existing) {
                throw new Error('Username already taken');
            }

            db.prepare('UPDATE users SET username = ? WHERE id = ?').run(
                normalizedUsername,
                userId
            );
        }

        if (params.displayName !== undefined) {
            db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(
                params.displayName.trim(),
                userId
            );
        }

        if (params.bio !== undefined) {
            db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(params.bio, userId);
        }

        if (params.avatarUrl !== undefined) {
            db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(
                params.avatarUrl,
                userId
            );
        }

        db.prepare(`UPDATE users SET updated_at = datetime('now') WHERE id = ?`).run(userId);

        return this.getUserById(userId)!;
    }

    static getAllDemoUsers(): UserSummary[] {
        const rows = BaseService.query<UserSummary>(
            `
                SELECT
                    id,
                    username,
                    display_name,
                    avatar_url,
                    last_seen_at,
                    is_bot
                FROM users
                WHERE is_bot = 0
                ORDER BY created_at ASC
            `,
            []
        );

        return rows.map((r) => ({
            ...r,
            is_bot: Boolean(r.is_bot),
        }));
    }

    static searchUsers(query: string, currentUserId: string): UserSummary[] {
        const q = `%${query.trim().toLowerCase()}%`;

        const rows = BaseService.query<UserSummary>(
            `
                SELECT
                    id,
                    username,
                    display_name,
                    avatar_url,
                    last_seen_at,
                    is_bot
                FROM users
                WHERE id != ?
                  AND (
                      LOWER(username) LIKE ?
                      OR LOWER(display_name) LIKE ?
                      OR phone_number LIKE ?
                  )
                LIMIT 20
            `,
            [currentUserId, q, q, q]
        );

        return rows.map((r) => ({
            ...r,
            is_bot: Boolean(r.is_bot),
        }));
    }

    static updateLastSeen(userId: string): void {
        BaseService.execute(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`, [userId]);
    }

    static createSession(
        userId: string,
        deviceName: string,
        deviceType: string,
        ipAddress?: string,
        clientVersion?: string
    ): { sessionId: string; refreshToken: string } {
        const sessionId = `sess_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

        const refreshToken = this.generateRefreshToken();
        const refreshTokenHash = this.hashRefreshToken(refreshToken);

        db.prepare(
            `
        INSERT INTO user_sessions (
            id,
            user_id,
            device_name,
            device_type,
            client_version,
            refresh_token_hash,
            ip_address,
            last_active_at,
            created_at,
            is_revoked
        )
        VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            datetime('now'),
            datetime('now'),
            0
        )
        `
        ).run(
            sessionId,
            userId,
            deviceName,
            deviceType,
            clientVersion || null,
            refreshTokenHash,
            ipAddress || null
        );

        return {
            sessionId,
            refreshToken,
        };
    }

    static refreshAccessToken(refreshToken: string): {
        token: string;
        refreshToken: string;
        sessionId: string;
    } {
        if (!refreshToken) {
            throw new Error('Refresh token is required');
        }

        const refreshTokenHash = this.hashRefreshToken(refreshToken);

        const session = db
            .prepare(
                `
            SELECT
                id,
                user_id,
                is_revoked
            FROM user_sessions
            WHERE refresh_token_hash = ?
            LIMIT 1
            `
            )
            .get(refreshTokenHash) as
            | {
                  id: string;
                  user_id: string;
                  is_revoked: number;
              }
            | undefined;

        if (!session || session.is_revoked) {
            throw new Error('Invalid or revoked refresh token');
        }

        const user = this.getUserById(session.user_id);

        if (!user) {
            throw new Error('User not found');
        }

        // Rotate the refresh token.
        const newRefreshToken = this.generateRefreshToken();
        const newRefreshTokenHash = this.hashRefreshToken(newRefreshToken);

        db.prepare(
            `
        UPDATE user_sessions
        SET
            refresh_token_hash = ?,
            last_active_at = datetime('now')
        WHERE id = ?
          AND user_id = ?
          AND is_revoked = 0
        `
        ).run(newRefreshTokenHash, session.id, session.user_id);

        const token = this.generateToken(user, session.id);

        return {
            token,
            refreshToken: newRefreshToken,
            sessionId: session.id,
        };
    }

    static getUserSessions(userId: string): UserSession[] {
        const rows = db
            .prepare(
                `
                SELECT
                    id,
                    user_id,
                    device_name,
                    device_type,
                    client_version,
                    ip_address,
                    last_active_at,
                    created_at
                FROM user_sessions
                WHERE user_id = ?
                  AND is_revoked = 0
                ORDER BY last_active_at DESC
                `
            )
            .all(userId) as any[];

        return rows;
    }

    static revokeSession(userId: string, sessionId: string): boolean {
        const result = db
            .prepare(
                `
                UPDATE user_sessions
                SET is_revoked = 1
                WHERE id = ?
                  AND user_id = ?
                  AND is_revoked = 0
                `
            )
            .run(sessionId, userId);

        return result.changes > 0;
    }
    /**
     * Request an OTP for the given phone number.
     * If the phone number is not registered, a new user will be created upon OTP verification.
     *
     * Resends are throttled per phone number (independent of the HTTP rate limiter)
     * and, outside production, the generated code is echoed back so the flow can be
     * completed without an SMS provider.
     */
    static async requestOTP(params: { phoneNumber: string }): Promise<{
        phoneNumber: string;
        expiresInSeconds: number;
        resendAfterSeconds: number;
        devCode?: string;
    }> {
        const phone = params.phoneNumber.trim();
        if (!phone) {
            throw new Error('Phone number is required');
        }

        const cooldown = OTPService.getResendCooldownSeconds(phone);
        if (cooldown > 0) {
            throw new Error(`Please wait ${cooldown}s before requesting another code`);
        }

        const otp = OTPService.generateOTP();
        OTPService.storeOTP(phone, otp);
        await OTPService.sendOTP(phone, otp);

        return {
            phoneNumber: phone,
            expiresInSeconds: Math.floor(OTPService.OTP_EXPIRY_TIME / 1000),
            resendAfterSeconds: Math.floor(OTPService.RESEND_COOLDOWN_TIME / 1000),
            // Dev-only echo. Gated on isProduction so a production deployment can
            // never leak a live login code to an unauthenticated caller.
            ...(config.isProduction ? {} : { devCode: OTPService.peekOTP(phone) ?? undefined }),
        };
    }

    /**
     * Verify OTP and sign in or create a user.
     * Returns user, access token, session ID, and refresh token.
     *
     * Accounts with 2FA enabled must use verifyOTPAndSignInWithChallenge():
     * this entry point refuses to mint a session for them.
     */
    static async verifyOTPAndSignIn(params: { phoneNumber: string; otp: string }): Promise<{
        user: User;
        token: string;
        accessToken: string;
        sessionId: string;
        refreshToken: string;
        twofa: TwoFactorStatus;
    }> {
        const outcome = await this.verifyOTPAndSignInWithChallenge(params);

        if (outcome.kind === 'challenge') {
            throw new Error('Two-factor authentication required');
        }

        const session = outcome.session;

        return {
            user: session.user,
            token: session.token,
            accessToken: session.accessToken,
            sessionId: session.sessionId,
            refreshToken: session.refreshToken,
            twofa: session.twofa ?? this.get2FAStatus(session.user.id),
        };
    }

    /**
     * Verify OTP and sign in, deferring session creation when 2FA is enabled.
     *
     * Same credential check as verifyOTPAndSignIn(); when the account has 2FA
     * active the caller gets a challenge instead of a session.
     */
    static async verifyOTPAndSignInWithChallenge(params: { phoneNumber: string; otp: string }): Promise<SignInOutcome> {
        const { phoneNumber, otp } = params;
        const phone = phoneNumber.trim();
        const enteredOTP = otp.trim();

        if (!OTPService.verifyOTP(phone, enteredOTP)) {
            throw new Error('Invalid or expired OTP');
        }

        // Check if user exists with this phone number
        let user = db.prepare('SELECT * FROM users WHERE phone_number = ?').get(phone) as User | null | undefined;

        if (!user) {
            // Create a new user with minimal info
            const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
            // Use phone number as display name temporarily; user can update later
            const displayName = phone;
            db.prepare(
                `
            INSERT INTO users (
                id,
                phone_number,
                username,
                display_name,
                bio,
                avatar_url,
                password_hash
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            `
            ).run(
                userId,
                phone,
                null, // username not set yet
                displayName,
                '', // bio empty
                null, // avatar URL
                null // password_hash null because no password set
            );
            user = this.getUserById(userId);
            if (!user) {
                throw new Error('Failed to create user');
            }
        } else {
            // Ensure user record is fresh
            user = this.getUserById(user.id);
            if (!user) {
                throw new Error('User not found');
            }
        }

        // Include 2FA status in response so client knows if challenge is needed
        const twofaStatus = this.get2FAStatus(user.id);

        if (twofaStatus.enabled) {
            return {
                kind: 'challenge',
                challenge: this.createTwoFactorChallenge(user.id, 'otp', {
                    deviceName: 'OTP Login',
                    deviceType: 'unknown',
                }),
            };
        }

        // Create session
        const session = this.createSession(
            user.id,
            'OTP Login', // device name
            'unknown',   // device type
            undefined    // IP address optional
        );

        const token = this.generateToken(user, session.sessionId);

        return {
            kind: 'session',
            session: {
                user,
                token,
                accessToken: token,
                sessionId: session.sessionId,
                refreshToken: session.refreshToken,
                twofa: twofaStatus,
            },
        };
    }

    // ==================== 2FA Methods ====================

    /**
     * Start 2FA setup. Generates a TOTP secret, backup codes, and QR code.
     *
     * The secret is stored as PENDING and 2FA is NOT activated yet: the user
     * has to confirm a code first. This keeps a half-finished setup from
     * locking the account out with a secret nobody saved.
     *
     * Returns the secret and QR code URI. Backup codes are NOT returned here
     * for security.
     */
    static async enable2FA(userId: string): Promise<{
        secret: string;
        qrCodeUri: string;
        qrCodeDataUrl: string;
        pending: true;
    }> {
        const user = this.getUserById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        if (user.is_2fa_enabled) {
            throw new Error('2FA is already enabled');
        }

        // Generate TOTP secret (base32 encoded, 20 bytes = 160 bits)
        const secret = generateSecret();

        // Generate QR code URI for authenticator apps
        const serviceName = 'Twine';
        const accountName = user.username || user.phone_number;
        const qrCodeUri = generateURI({
            issuer: serviceName,
            label: accountName,
            secret,
        });

        // Generate 10 backup codes (8 alphanumeric chars each)
        const backupCodes = Array.from({ length: 10 }, () =>
            crypto.randomBytes(5).toString('base64url').slice(0, 8).toUpperCase()
        );

        // Hash backup codes for storage
        const backupCodeHashes = await Promise.all(
            backupCodes.map((code) => bcrypt.hash(code, 10))
        );

        // Store as pending. is_2fa_enabled stays 0 until a code is confirmed.
        db.prepare(
            `UPDATE users SET totp_pending_secret = ?, totp_pending_backup_codes = ? WHERE id = ?`
        ).run(secret, JSON.stringify(backupCodeHashes), userId);

        // Generate QR code as data URL (for display in client)
        const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUri);

        return {
            secret,
            qrCodeUri,
            qrCodeDataUrl,
            pending: true,
        };
    }

    /**
     * Verify a TOTP token against a raw secret.
     * Allows ±1 time window (30 seconds) for clock drift.
     */
    private static verifyTotpSecret(secret: string | null | undefined, token: string): boolean {
        if (!secret || !token) {
            return false;
        }

        try {
            // epochTolerance: 30 allows one 30-second period of clock drift
            const result = verifySync({
                token,
                secret,
                epochTolerance: 30,
            });
            return result.valid;
        } catch {
            return false;
        }
    }

    /**
     * Verify a token against the pending setup (promoting it on success) or,
     * when there is no pending setup, against the active secret.
     *
     * A wrong token is a normal outcome: `valid` is false and nothing changes.
     */
    static verifyTwoFactorToken(userId: string, token: string): { valid: boolean; activated: boolean } {
        const user = db
            .prepare(
                'SELECT totp_secret, totp_pending_secret, totp_pending_backup_codes FROM users WHERE id = ?'
            )
            .get(userId) as
            | {
                totp_secret: string | null;
                totp_pending_secret: string | null;
                totp_pending_backup_codes: string | null;
            }
            | undefined;

        if (!user) {
            return { valid: false, activated: false };
        }

        if (user.totp_pending_secret) {
            if (!this.verifyTotpSecret(user.totp_pending_secret, token)) {
                return { valid: false, activated: false };
            }

            db.prepare(
                `UPDATE users
                 SET is_2fa_enabled = 1,
                     totp_secret = ?,
                     backup_codes = ?,
                     totp_pending_secret = NULL,
                     totp_pending_backup_codes = NULL,
                     twofa_enabled_at = datetime('now')
                 WHERE id = ?`
            ).run(user.totp_pending_secret, user.totp_pending_backup_codes, userId);

            return { valid: true, activated: true };
        }

        if (!user.totp_secret) {
            return { valid: false, activated: false };
        }

        return { valid: this.verifyTotpSecret(user.totp_secret, token), activated: false };
    }

    /**
     * Retrieve plaintext backup codes. Requires valid TOTP token for authorization.
     * Returns the codes only once per call; caller must store them securely.
     */
    static async getBackupCodes(userId: string, token: string): Promise<string[] | null> {
        if (!this.verify2FAToken(userId, token)) {
            return null;
        }

        const user = db.prepare('SELECT backup_codes FROM users WHERE id = ?').get(userId) as { backup_codes: string } | undefined;
        if (!user || !user.backup_codes) {
            return null;
        }

        // We cannot retrieve plaintext from hashes. Return the hashes for reference,
        // or generate new ones if user needs to see them.
        // For security, we return null here and require regenerateBackupCodes for new ones.
        return null;
    }

    /**
     * Regenerate backup codes and return new plaintext codes.
     * Requires valid TOTP token. Old codes are invalidated.
     */
    static async regenerateBackupCodes(userId: string, token: string): Promise<string[] | null> {
        if (!this.verify2FAToken(userId, token)) {
            return null;
        }

        const backupCodes = Array.from({ length: 10 }, () =>
            crypto.randomBytes(5).toString('base64url').slice(0, 8).toUpperCase()
        );

        const backupCodeHashes = await Promise.all(
            backupCodes.map((code) => bcrypt.hash(code, 10))
        );

        db.prepare(`UPDATE users SET backup_codes = ? WHERE id = ?`).run(JSON.stringify(backupCodeHashes), userId);

        return backupCodes;
    }

    /**
     * Verify a TOTP token for 2FA login or enabling flow.
     * Allows ±1 time window (30 seconds) for clock drift.
     */
    static verify2FAToken(userId: string, token: string): boolean {
        const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId) as { totp_secret: string } | undefined;
        if (!user || !user.totp_secret) {
            return false;
        }

        return this.verifyTotpSecret(user.totp_secret, token);
    }

    /**
     * Disable 2FA for a user. Requires valid TOTP token or backup code
     * against the ACTIVE secret. Any pending setup is discarded as well.
     */
    static async disable2FA(userId: string, tokenOrBackupCode: string): Promise<boolean> {
        const user = db.prepare('SELECT totp_secret, backup_codes FROM users WHERE id = ?').get(userId) as { totp_secret: string; backup_codes: string } | undefined;
        if (!user || !user.totp_secret) {
            return false;
        }

        // First try TOTP token
        if (this.verify2FAToken(userId, tokenOrBackupCode)) {
            db.prepare(`UPDATE users SET is_2fa_enabled = 0, totp_secret = NULL, backup_codes = NULL, totp_pending_secret = NULL, totp_pending_backup_codes = NULL, twofa_enabled_at = NULL WHERE id = ?`).run(userId);
            return true;
        }

        // Then try backup code
        if (await this.verifyBackupCode(userId, tokenOrBackupCode)) {
            db.prepare(`UPDATE users SET is_2fa_enabled = 0, totp_secret = NULL, backup_codes = NULL, totp_pending_secret = NULL, totp_pending_backup_codes = NULL, twofa_enabled_at = NULL WHERE id = ?`).run(userId);
            return true;
        }

        return false;
    }

    /**
     * Verify and consume a backup code. Returns true if valid and unused.
     */
    static async verifyBackupCode(userId: string, code: string): Promise<boolean> {
        const user = db.prepare('SELECT backup_codes FROM users WHERE id = ?').get(userId) as { backup_codes: string } | undefined;
        if (!user || !user.backup_codes) {
            return false;
        }

        let backupCodeHashes: string[];
        try {
            backupCodeHashes = JSON.parse(user.backup_codes);
        } catch {
            return false;
        }

        for (let i = 0; i < backupCodeHashes.length; i++) {
            const hash = backupCodeHashes[i];
            const matches = await bcrypt.compare(code, hash);
            if (matches) {
                // Consume the backup code by removing it from the array
                backupCodeHashes.splice(i, 1);
                db.prepare(`UPDATE users SET backup_codes = ? WHERE id = ?`).run(JSON.stringify(backupCodeHashes), userId);
                return true;
            }
        }

        return false;
    }

    /**
     * Check if 2FA is enabled for a user.
     */
    static is2FAEnabled(userId: string): boolean {
        const user = db.prepare('SELECT is_2fa_enabled FROM users WHERE id = ?').get(userId) as { is_2fa_enabled: number } | undefined;
        return user?.is_2fa_enabled === 1;
    }

    /**
     * Get 2FA status for a user (enabled, when enabled, backup codes remaining,
     * and whether a setup is waiting to be confirmed).
     */
    static get2FAStatus(userId: string): TwoFactorStatus {
        const user = db.prepare('SELECT is_2fa_enabled, twofa_enabled_at, backup_codes, totp_pending_secret FROM users WHERE id = ?').get(userId) as { is_2fa_enabled: number; twofa_enabled_at: string | null; backup_codes: string | null; totp_pending_secret: string | null } | undefined;
        if (!user) {
            return { enabled: false, enabledAt: null, backupCodesRemaining: 0, pending: false };
        }
        let backupCodesRemaining = 0;
        if (user.backup_codes) {
            try {
                backupCodesRemaining = JSON.parse(user.backup_codes).length;
            } catch {
                backupCodesRemaining = 0;
            }
        }
        return {
            enabled: user.is_2fa_enabled === 1,
            enabledAt: user.twofa_enabled_at,
            backupCodesRemaining,
            pending: Boolean(user.totp_pending_secret),
        };
    }

    // ==================== Login Challenge ====================

    /**
     * Pending second-factor challenges.
     *
     * Held in memory on purpose: a challenge is a short-lived, single-use
     * bearer of "the password was already checked". A multi-instance
     * deployment would need a shared store (Redis) for this to work across
     * processes.
     */
    private static challenges: Map<string, TwoFactorChallengeState> = new Map();
    private static readonly CHALLENGE_TTL_MS = 5 * 60 * 1000;
    private static readonly CHALLENGE_MAX_ATTEMPTS = 5;

    /**
     * Create a second-factor challenge for an already authenticated (by
     * password or OTP) user. No session is created until it is completed.
     */
    static createTwoFactorChallenge(
        userId: string,
        origin: 'password' | 'otp',
        options?: {
            deviceName?: string;
            deviceType?: string;
            ipAddress?: string;
        }
    ): TwoFactorChallenge {
        this.pruneChallenges();

        const challengeId = crypto.randomUUID();
        this.challenges.set(challengeId, {
            challengeId,
            userId,
            origin,
            method: 'totp',
            deviceName: options?.deviceName || 'Web Browser',
            deviceType: options?.deviceType || 'web',
            ipAddress: options?.ipAddress,
            expiresAt: Date.now() + this.CHALLENGE_TTL_MS,
            attempts: 0,
            maxAttempts: this.CHALLENGE_MAX_ATTEMPTS,
        });

        return {
            requiresTwoFactor: true,
            challengeId,
            method: 'totp',
        };
    }

    /**
     * Drop expired challenges. Called whenever a challenge is created so the
     * map cannot grow without bound.
     */
    private static pruneChallenges(): void {
        const now = Date.now();
        for (const [id, challenge] of this.challenges.entries()) {
            if (challenge.expiresAt <= now) {
                this.challenges.delete(id);
            }
        }
    }

    /**
     * Complete a second-factor challenge and issue the sign-in session.
     *
     * A wrong code leaves the challenge usable but counts towards the attempt
     * limit; after too many wrong codes the challenge is invalidated and the
     * user has to sign in again.
     */
    static async completeTwoFactorChallenge(challengeId: string, token: string): Promise<SessionSignIn> {
        const challenge = this.challenges.get(challengeId);

        if (!challenge) {
            throw new Error('Two-factor challenge expired or already used');
        }

        if (challenge.expiresAt <= Date.now()) {
            this.challenges.delete(challengeId);
            throw new Error('Two-factor challenge expired');
        }

        if (challenge.attempts >= challenge.maxAttempts) {
            this.challenges.delete(challengeId);
            throw new Error('Too many invalid attempts. Please sign in again.');
        }

        const totpValid = this.verify2FAToken(challenge.userId, token);
        const backupValid = totpValid ? false : await this.verifyBackupCode(challenge.userId, token);

        if (!totpValid && !backupValid) {
            challenge.attempts++;
            if (challenge.attempts >= challenge.maxAttempts) {
                this.challenges.delete(challengeId);
                throw new Error('Too many invalid attempts. Please sign in again.');
            }
            throw new Error('Invalid two-factor code');
        }

        // Single use: the challenge is consumed as soon as it succeeds.
        this.challenges.delete(challengeId);

        const user = this.getUserById(challenge.userId);
        if (!user) {
            throw new Error('User not found');
        }

        const session = this.createSession(
            user.id,
            challenge.deviceName,
            challenge.deviceType,
            challenge.ipAddress
        );

        const sessionToken = this.generateToken(user, session.sessionId);

        const sessionSignIn: SessionSignIn = {
            user,
            token: sessionToken,
            accessToken: sessionToken,
            sessionId: session.sessionId,
            refreshToken: session.refreshToken,
        };

        // The OTP sign-in response carries the 2FA status; mirror that shape.
        if (challenge.origin === 'otp') {
            sessionSignIn.twofa = this.get2FAStatus(user.id);
        }

        return sessionSignIn;
    }
}

interface TwoFactorChallengeState {
    challengeId: string;
    userId: string;
    origin: 'password' | 'otp';
    method: TwoFactorMethod;
    deviceName: string;
    deviceType: string;
    ipAddress?: string;
    expiresAt: number;
    attempts: number;
    maxAttempts: number;
}
