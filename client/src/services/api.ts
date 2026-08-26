import { User, UserSummary, Chat, Message, UserSession } from '../types/index';

const API_BASE = '/api';

export class ApiService {
  private static token: string | null = localStorage.getItem('auth_token');

  static setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  static getToken(): string | null {
    return this.token || localStorage.getItem('auth_token');
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP error ${res.status}`);
    }
    return data;
  }

  static async getDemoUsers(): Promise<{ users: UserSummary[] }> {
    return this.request('/auth/demo-users');
  }

  static async demoLogin(userId: string): Promise<{ user: User; token: string }> {
    const data = await this.request<{ user: User; token: string }>('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    this.setToken(data.token);
    return data;
  }

  static async login(identifier: string, password?: string): Promise<{ user: User; token: string }> {
    const data = await this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    this.setToken(data.token);
    return data;
  }

  static async register(params: {
    phoneNumber: string;
    username: string;
    displayName: string;
    password?: string;
  }): Promise<{ user: User; token: string }> {
    const data = await this.request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    this.setToken(data.token);
    return data;
  }

  static async getMe(): Promise<{ user: User }> {
    return this.request('/auth/me');
  }

  static async updateProfile(params: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    username?: string;
  }): Promise<{ user: User }> {
    return this.request('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(params),
    });
  }

  static async getSessions(): Promise<{ sessions: UserSession[] }> {
    return this.request('/users/sessions');
  }

  static async revokeSession(sessionId: string): Promise<{ success: boolean }> {
    return this.request(`/users/sessions/${sessionId}/revoke`, {
      method: 'POST',
    });
  }

  static async getChats(): Promise<{ chats: Chat[] }> {
    return this.request('/chats');
  }

  static async createDirectChat(targetUserId: string): Promise<{ chat: Chat }> {
    return this.request('/chats/direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
  }

  static async createGroup(params: {
    title: string;
    description?: string;
    avatarUrl?: string;
    type: 'GROUP' | 'SUPERGROUP' | 'CHANNEL';
    memberIds?: string[];
  }): Promise<{ chat: Chat }> {
    return this.request('/groups/create', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  static async getChatMembers(chatId: string): Promise<{ members: any[] }> {
    return this.request(`/chats/${chatId}/members`);
  }

  static async getMessages(chatId: string, limit = 50): Promise<{ messages: Message[] }> {
    return this.request(`/chats/${chatId}/messages?limit=${limit}`);
  }

  static async markChatRead(chatId: string): Promise<{ success: boolean; count: number; readMessageIds: string[] }> {
    return this.request(`/chats/${chatId}/read-all`, {
      method: 'POST',
    });
  }

  static async searchUsers(query: string): Promise<{ users: UserSummary[] }> {
    return this.request(`/users/search?q=${encodeURIComponent(query)}`);
  }

  static async searchMessages(query: string): Promise<{ messages: Message[] }> {
    return this.request(`/messages/search?q=${encodeURIComponent(query)}`);
  }

  static async uploadMedia(params: {
    base64Data: string;
    fileName: string;
    mimeType: string;
    waveform?: number[];
  }): Promise<{ media: { url: string; fileName: string; fileSize: number; mimeType: string; waveform?: number[] } }> {
    return this.request('/media/upload', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  static async getAISummary(chatId: string): Promise<{
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    sentiment: 'positive' | 'neutral' | 'urgent';
  }> {
    return this.request('/ai/summarize', {
      method: 'POST',
      body: JSON.stringify({ chatId }),
    });
  }

  static async getSmartReplies(chatId: string): Promise<{ replies: string[] }> {
    return this.request(`/ai/smart-replies/${chatId}`);
  }

  static async translateMessage(text: string, targetLang: string): Promise<{ original: string; translated: string; targetLang: string }> {
    return this.request('/ai/translate', {
      method: 'POST',
      body: JSON.stringify({ text, targetLang }),
    });
  }

  static async semanticSearch(query: string, chatId?: string): Promise<{ results: { message: Message; score: number; matchReason: string }[] }> {
    return this.request('/ai/semantic-search', {
      method: 'POST',
      body: JSON.stringify({ query, chatId }),
    });
  }

  static async transcribeVoice(audioUrl: string, duration?: number): Promise<{ transcript: string; confidence: number; language: string }> {
    return this.request('/ai/transcribe-voice', {
      method: 'POST',
      body: JSON.stringify({ audioUrl, duration }),
    });
  }

  static async moderateContent(text: string, sensitivity?: 'LOW' | 'MEDIUM' | 'STRICT'): Promise<{
    flagged: boolean;
    reason?: string;
    action: 'ALLOW' | 'WARN' | 'DELETE';
    category?: string;
  }> {
    return this.request('/ai/moderate', {
      method: 'POST',
      body: JSON.stringify({ text, sensitivity }),
    });
  }

  static async getCallSummary(durationSeconds: number, callerName: string): Promise<{
    title: string;
    summary: string;
    keyDecisions: string[];
    actionItems: string[];
    durationFormatted: string;
  }> {
    return this.request('/ai/call-summary', {
      method: 'POST',
      body: JSON.stringify({ durationSeconds, callerName }),
    });
  }

  static async suggestGroupTopics(chatId: string, chatTitle?: string): Promise<{
    suggestedTopics: string[];
    suggestedRename?: string;
    activitySummary: string;
  }> {
    return this.request('/ai/suggest-topics', {
      method: 'POST',
      body: JSON.stringify({ chatId, chatTitle }),
    });
  }

  static async createPoll(params: {
    chatId: string;
    question: string;
    options: string[];
    isAnonymous?: boolean;
    isQuiz?: boolean;
    correctOptionId?: string;
    explanation?: string;
  }): Promise<{ message: Message }> {
    return this.request('/polls/create', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  static async votePoll(pollId: string, optionId: string): Promise<{ poll: any }> {
    return this.request('/polls/vote', {
      method: 'POST',
      body: JSON.stringify({ pollId, optionId }),
    });
  }

  static async getThreadMessages(parentMessageId: string): Promise<{ parent: Message; messages: Message[] }> {
    return this.request(`/threads/${parentMessageId}`);
  }

  static async getChannelAnalytics(chatId: string): Promise<any> {
    return this.request(`/channels/${chatId}/analytics`);
  }

  static async getFederationStatus(): Promise<any> {
    return this.request('/federation/status');
  }

  static async subscribePush(subscription: any): Promise<{ success: boolean }> {
    return this.request('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription }),
    });
  }

  static async blockUser(userId: string): Promise<{ success: boolean; blocked_user_id: string }> {
    return this.request(`/users/${userId}/block`, {
      method: 'POST',
    });
  }

  static async unblockUser(userId: string): Promise<{ success: boolean; unblocked_user_id: string }> {
    return this.request(`/users/${userId}/unblock`, {
      method: 'POST',
    });
  }

  static async getBlockedUsers(): Promise<{ blockedUserIds: string[] }> {
    return this.request('/users/blocked');
  }
}

