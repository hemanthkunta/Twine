import { User, Chat, Message, UserSession } from '../types';

const API_BASE = 'http://localhost:4000/api';

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

  async login(phoneNumber: string, password: string) {
    return this.request<{ user: User; token: string }>('POST', '/auth/login', {
      phone_number: phoneNumber,
      password,
    });
  }

  async getMe() {
    return this.request<{ user: User }>('GET', '/auth/me');
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
}

export default new ApiService();
