import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { User, UserSession, UserSummary } from '../types/protocol.js';

interface AccessTokenPayload {
    id: string;
    username: string | null;
    phone_number: string;
    session_id: string;
}

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
        const session = db
            .prepare(
                `
                SELECT id
                FROM user_sessions
                WHERE id = ?
                  AND user_id = ?
                  AND is_revoked = 0
                LIMIT 1
                `
            )
            .get(sessionId, userId);

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
    ): {
        user: User;
        token: string;
        sessionId: string;
        refreshToken: string;
    } {
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

        const session = this.createSession(
            user.id,
            options?.deviceName || 'Web Browser',
            options?.deviceType || 'web',
            options?.ipAddress
        );

        const token = this.generateToken(cleanUser, session.sessionId);

        return {
            user: cleanUser,
            token,
            sessionId: session.sessionId,
            refreshToken: session.refreshToken,
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
    ): {
        user: User;
        token: string;
        sessionId: string;
        refreshToken: string;
    } {
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
        const row = db
            .prepare(
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
                `
            )
            .get(id) as any;

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
        const rows = db
            .prepare(
                `
                SELECT
                    id,
                    username,
                    display_name,
                    avatar_url,
                    last_seen_at,
                    is_bot
                FROM users
                ORDER BY created_at ASC
                `
            )
            .all() as any[];

        return rows.map((r) => ({
            ...r,
            is_bot: Boolean(r.is_bot),
        }));
    }

    static searchUsers(query: string, currentUserId: string): UserSummary[] {
        const q = `%${query.trim().toLowerCase()}%`;

        const rows = db
            .prepare(
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
                `
            )
            .all(currentUserId, q, q, q) as any[];

        return rows.map((r) => ({
            ...r,
            is_bot: Boolean(r.is_bot),
        }));
    }

    static updateLastSeen(userId: string): void {
        db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(userId);
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
}
