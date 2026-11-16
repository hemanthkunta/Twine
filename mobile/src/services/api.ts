import { User, Chat, Message, UserSession, LoginResult, TwoFactorChallenge, ChatMember } from '../types';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

class ApiService {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
    }

    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error('API error: ' + err);
    }

    return res.json();
  }

  // ── Auth ──────────────────────────────────────────────────────────
  async getDemoUsers() {
    return this.request<{
      users: Array<{ id: string; username: string }>;
    }>('GET', '/auth/demo-users');
  }

  async loginDemo(account: string) {
    const { users } = await this.getDemoUsers();
    const demoUser = users.find(
      (u) => u.username.toLowerCase() === account.toLowerCase(),
    );
    if (!demoUser) {
      throw new Error('Demo account "' + account + '" not found');
    }
    return this.request<{ user: User; token: string }>(
      'POST',
      '/auth/demo-login',
      { userId: demoUser.id },
    );
  }

  async login(identifier: string, password: string): Promise<LoginResult> {
    const result = await this.request<LoginResult>('POST', '/auth/login', {
      identifier,
      password,
    });
    return result;
  }

  /**
   * Complete a second-factor challenge with a TOTP code or backup code.
   * The backend answers with the normal sign-in response.
   */
  async completeTwoFactorChallenge(
    challengeId: string,
    token: string,
  ): Promise<LoginResult & { user: User; token: string }> {
    return this.request<LoginResult & { user: User; token: string }>(
      'POST',
      '/auth/2fa/challenge',
      { challengeId, token },
    );
  }

  async getMe() {
    return this.request<{ user: User }>('GET', '/auth/me');
  }

  async logout() {
    return this.request<{ success: boolean }>('POST', '/auth/logout');
  }


  // ── Chats ─────────────────────────────────────────────────────────
  async getChats() {
    return this.request<{ chats: Chat[] }>('GET', '/chats');
  }

  async createDirectChat(userId: string) {
    return this.request<{ chat: Chat }>('POST', '/chats/direct', {
      targetUserId: userId,
    });
  }

  async createGroup(title: string, memberIds: string[]) {
    return this.request<{ chat: Chat }>('POST', '/groups/create', {
      title,
      memberIds,
    });
  }

  // ── Messages ──────────────────────────────────────────────────────
  async getMessages(chatId: string, limit = 50, before?: string) {
    let path = '/chats/' + chatId + '/messages?limit=' + limit;
    if (before) path += '&before=' + before;
    return this.request<{ messages: Message[] }>('GET', path);
  }

  async markRead(chatId: string) {
    return this.request<{ success: boolean; count: number }>(
      'POST',
      '/chats/' + chatId + '/read-all',
    );
  }

  // ── Users ─────────────────────────────────────────────────────────
  async searchUsers(query: string) {
    return this.request<{ users: User[] }>('GET', '/users/search?q=' + encodeURIComponent(query));
  }

  async updateProfile(body: { displayName?: string; username?: string; bio?: string; avatarUrl?: string }) {
    return this.request<{ user: User }>('PUT', '/users/profile', body);
  }

  getApiOrigin() {
    return API_BASE.replace(/\/api\/?$/, '');
  }


  // ── Media Upload ──────────────────────────────────────────────────
  async uploadMedia(base64Data: string, fileName: string, mimeType: string, waveform?: number[]) {
    return this.request<{ media: { url: string; fileName: string; fileSize: number; mimeType: string } }>('POST', '/media/upload', {
      base64Data,
      fileName,
      mimeType,
      waveform,
    });
  }

  // ── Sessions ──────────────────────────────────────────────────────
  async getSessions() {
    return this.request<{ sessions: UserSession[] }>('GET', '/users/sessions');
  }

  async revokeSession(sessionId: string) {
    return this.request<{ success: boolean }>('POST', '/users/sessions/' + sessionId + '/revoke');
  }

  // ── E2EE keys and devices ─────────────────────────────────────────
  async publishPublicKey(publicKey: string) {
    return this.request<{ user_id: string; public_key: string }>('POST', '/keys/publish', {
      publicKey,
    });
  }

  async getPublicKey(userId: string) {
    return this.request<{ user_id: string; public_key: string }>('GET', '/keys/' + userId);
  }

  async publishPreKeyBundle(bundle: {
    registrationId: number;
    deviceId: number;
    preKeyId: number;
    preKeyPublic: string;
    signedPreKeyId: number;
    signedPreKeyPublic: string;
    signedPreKeySignature: string;
    identityKey: string;
    oneTimePreKeys: Array<{ id: number; publicKey: string }>;
  }) {
    const response = await this.request<{ success: boolean }>('POST', '/keys/bundle', bundle);
    return Boolean(response?.success);
  }

  async getPreKeyBundle(userId: string, deviceId?: number) {
    const path = deviceId
      ? '/keys/bundle/' + userId + '/' + deviceId
      : '/keys/bundle/' + userId;
    return this.request<{
      bundle: {
        registrationId: number;
        deviceId: number;
        preKeyId: number;
        preKeyPublic: string;
        signedPreKeyId: number;
        signedPreKeyPublic: string;
        signedPreKeySignature: string;
        identityKey: string;
        oneTimePreKeys: Array<{ id: number; publicKey: string }>;
      };
    }>('GET', path);
  }

  async listDevices() {
    return this.request<{
      devices: Array<{
        deviceId: number;
        deviceName: string | null;
        publicKey: string;
        isRevoked: boolean;
      }>;
    }>('GET', '/devices');
  }

  async registerDevice(deviceId: number, deviceName: string | null, publicKey: string) {
    return this.request<{ device: { deviceId: number } }>('POST', '/devices', {
      deviceId,
      deviceName,
      publicKey,
    });
  }

  async listPeerDevices(userId: string) {
    return this.request<{
      devices: Array<{
        deviceId: number;
        deviceName: string | null;
        publicKey: string;
        isRevoked: boolean;
      }>;
    }>('GET', '/keys/devices/' + userId);
  }

  // ── Group sender keys ─────────────────────────────────────────────
  async getChatMembers(chatId: string) {
    return this.request<{ members: ChatMember[] }>('GET', '/chats/' + chatId + '/members');
  }

  async publishSenderKeys(
    chatId: string,
    keys: Array<{ recipientId: string; wrappedKey: string }>,
  ) {
    return this.request<{ success: boolean; stored: number }>(
      'POST',
      '/chats/' + chatId + '/sender-keys',
      { keys },
    );
  }

  async getSenderKeys(chatId: string) {
    return this.request<{
      keys: Array<{ sender_id: string; wrapped_key: string; updated_at?: string }>;
      my_recipients: string[];
    }>('GET', '/chats/' + chatId + '/sender-keys');
  }
}

export default new ApiService();
