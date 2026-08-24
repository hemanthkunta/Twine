import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { User, UserSession, UserSummary } from '../types/protocol.js';

export class AuthService {
  static generateToken(user: User): string {
    return (jwt.sign as any)(
      {
        id: user.id,
        username: user.username,
        phone_number: user.phone_number,
      },
      config.jwtSecret,
      { expiresIn: config.tokenExpiresIn }
    );
  }

  static verifyToken(token: string): { id: string; username: string; phone_number: string } | null {
    try {
      return jwt.verify(token, config.jwtSecret) as { id: string; username: string; phone_number: string };
    } catch {
      return null;
    }
  }

  static register(params: {
    phoneNumber: string;
    username: string;
    displayName: string;
    password?: string;
    bio?: string;
    avatarUrl?: string;
  }): { user: User; token: string } {
    const existing = db
      .prepare('SELECT * FROM users WHERE phone_number = ? OR username = ?')
      .get(params.phoneNumber, params.username.toLowerCase()) as User | undefined;

    if (existing) {
      if (existing.phone_number === params.phoneNumber) {
        throw new Error('Phone number already registered');
      }
      throw new Error('Username already taken');
    }

    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const passwordHash = params.password ? bcrypt.hashSync(params.password, 8) : null;
    const avatarUrl =
      params.avatarUrl ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(params.username)}`;

    db.prepare(`
      INSERT INTO users (id, phone_number, username, display_name, bio, avatar_url, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      params.phoneNumber,
      params.username.toLowerCase(),
      params.displayName,
      params.bio || '',
      avatarUrl,
      passwordHash
    );

    const user = this.getUserById(userId)!;
    const token = this.generateToken(user);
    this.createSession(userId, 'Web Browser', 'web');
    return { user, token };
  }

  static login(identifier: string, password?: string): { user: User; token: string } {
    const normalized = identifier.trim().toLowerCase();
    const user = db
      .prepare('SELECT * FROM users WHERE LOWER(username) = ? OR phone_number = ?')
      .get(normalized, identifier.trim()) as (User & { password_hash?: string }) | undefined;

    if (!user) {
      throw new Error('User not found');
    }

    if (password && user.password_hash) {
      const isValid = bcrypt.compareSync(password, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid password');
      }
    }

    const cleanUser = this.getUserById(user.id)!;
    const token = this.generateToken(cleanUser);
    this.createSession(user.id, 'Web Browser', 'web');
    return { user: cleanUser, token };
  }

  static loginWithPassword(identifier: string, password?: string): { user: User; token: string } {
    return this.login(identifier, password);
  }

  static demoLogin(userId: string): { user: User; token: string } {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('Demo user not found');
    }
    const token = this.generateToken(user);
    this.createSession(userId, 'Desktop Client', 'desktop');
    return { user, token };
  }

  static getUserById(id: string): User | null {
    const row = db.prepare(`
      SELECT id, phone_number, username, display_name, bio, avatar_url, is_2fa_enabled, is_bot, last_seen_at, created_at, updated_at
      FROM users WHERE id = ?
    `).get(id) as any;
    if (!row) return null;
    return {
      ...row,
      is_bot: Boolean(row.is_bot),
    };
  }

  static updateProfile(userId: string, params: { displayName?: string; bio?: string; avatarUrl?: string; username?: string }): User {
    if (params.username) {
      const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ? AND id != ?').get(params.username.toLowerCase(), userId);
      if (existing) throw new Error('Username already taken');
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(params.username.toLowerCase(), userId);
    }

    if (params.displayName) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(params.displayName, userId);
    }
    if (params.bio !== undefined) {
      db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(params.bio, userId);
    }
    if (params.avatarUrl) {
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(params.avatarUrl, userId);
    }

    db.prepare(`UPDATE users SET updated_at = datetime('now') WHERE id = ?`).run(userId);
    return this.getUserById(userId)!;
  }

  static getAllDemoUsers(): UserSummary[] {
    const rows = db.prepare(`
      SELECT id, username, display_name, avatar_url, last_seen_at, is_bot
      FROM users
      ORDER BY created_at ASC
    `).all() as any[];
    return rows.map((r) => ({ ...r, is_bot: Boolean(r.is_bot) }));
  }

  static searchUsers(query: string, currentUserId: string): UserSummary[] {
    const q = `%${query.trim().toLowerCase()}%`;
    const rows = db.prepare(`
      SELECT id, username, display_name, avatar_url, last_seen_at, is_bot
      FROM users
      WHERE id != ? AND (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ? OR phone_number LIKE ?)
      LIMIT 20
    `).all(currentUserId, q, q, q) as any[];
    return rows.map((r) => ({ ...r, is_bot: Boolean(r.is_bot) }));
  }

  static updateLastSeen(userId: string) {
    db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`).run(userId);
  }

  static createSession(userId: string, deviceName: string, deviceType: string): string {
    const sessId = `sess_${crypto.randomUUID().slice(0, 12)}`;
    db.prepare(`
      INSERT INTO user_sessions (id, user_id, device_name, device_type, ip_address, last_active_at)
      VALUES (?, ?, ?, ?, '127.0.0.1', datetime('now'))
    `).run(sessId, userId, deviceName, deviceType);
    return sessId;
  }

  static getUserSessions(userId: string): UserSession[] {
    const rows = db.prepare(`
      SELECT id, user_id, device_name, device_type, client_version, ip_address, last_active_at, created_at
      FROM user_sessions
      WHERE user_id = ? AND is_revoked = 0
      ORDER BY last_active_at DESC
    `).all(userId) as any[];

    return rows;
  }

  static revokeSession(userId: string, sessionId: string) {
    db.prepare('UPDATE user_sessions SET is_revoked = 1 WHERE id = ? AND user_id = ?').run(sessionId, userId);
  }
}
