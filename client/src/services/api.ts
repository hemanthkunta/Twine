import { User, UserSummary, Chat, Message, UserSession } from '../types/index';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';

export class ApiService {
    private static token: string | null = localStorage.getItem('auth_token');
    private static refreshToken: string | null = localStorage.getItem('refresh_token');
    private static refreshPromise: Promise<boolean> | null = null;
    private static autoRefreshTimer: any = null;

    static init() {
        if (typeof window !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.getRefreshToken()) {
                    this.refreshSession().catch(() => {});
                }
            });
            window.addEventListener('focus', () => {
                if (this.getRefreshToken()) {
                    this.refreshSession().catch(() => {});
                }
            });
            this.scheduleAutoRefresh();
        }
    }

    private static scheduleAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
        }
        this.autoRefreshTimer = setInterval(() => {
            if (this.getRefreshToken()) {
                this.refreshSession().catch(() => {});
            }
        }, 10 * 60 * 1000);
    }

    static setToken(token: string | null, refreshToken?: string | null) {
        this.token = token;
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }

        if (refreshToken !== undefined) {
            this.refreshToken = refreshToken;
            if (refreshToken) {
                localStorage.setItem('refresh_token', refreshToken);
            } else {
                localStorage.removeItem('refresh_token');
            }
        }

        if (token && this.refreshToken) {
            this.scheduleAutoRefresh();
        } else if (!token && !this.refreshToken && this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
    }

    static getToken(): string | null {
        return this.token || localStorage.getItem('auth_token');
    }

    static getRefreshToken(): string | null {
        return this.refreshToken || localStorage.getItem('refresh_token');
    }

    static getMediaUrl(url: string): string {
        if (!url) return '';
        if (
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('data:') ||
            url.startsWith('blob:')
        ) {
            return url;
        }
        if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
            return url.startsWith('/') ? url : `/${url}`;
        }
        return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
    }

    private static async request<T>(
        endpoint: string,
        options: RequestInit = {},
        isRetry = false
    ): Promise<T> {
        const token = this.getToken();
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                ...options,
                headers,
                signal: options.signal || controller.signal,
            });

            clearTimeout(timeoutId);

            if (res.status === 204) {
                return null as unknown as T;
            }

            const contentType = res.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');
            const data = isJson ? await res.json() : await res.text();

            if (!res.ok) {
                const isAuthEndpoint =
                    endpoint.includes('/auth/login') ||
                    endpoint.includes('/auth/register') ||
                    endpoint.includes('/auth/refresh') ||
                    endpoint.includes('/auth/demo-login');

                if (res.status === 401 && !isAuthEndpoint && !isRetry) {
                    const refreshed = await this.refreshSession();
                    if (refreshed) {
                        return this.request<T>(endpoint, options, true);
                    } else {
                        console.warn('Silent refresh failed. Session expired on:', endpoint);
                        this.setToken(null, null);
                        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                    }
                } else if (res.status === 401 && !isAuthEndpoint && isRetry) {
                    this.setToken(null, null);
                    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                }

                const errorMsg = isJson ? data.error || `HTTP ${res.status}` : data || `HTTP ${res.status}`;
                throw new Error(errorMsg);
            }

            return data as T;
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`Request timeout for ${endpoint}`);
            }
            throw err;
        }
    }

    static async refreshSession(): Promise<boolean> {
        const rToken = this.getRefreshToken();
        if (!rToken) return false;

        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = (async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const res = await fetch(`${API_BASE}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: rToken }),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!res.ok) {
                    return false;
                }

                const data = await res.json();
                if (data?.token) {
                    this.setToken(data.token, data.refreshToken || rToken);
                    return true;
                }
                return false;
            } catch {
                return false;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    static async getDemoUsers(): Promise<{ users: UserSummary[] }> {
        return this.request('/auth/demo-users');
    }

    static async demoLogin(
        userId: string
    ): Promise<{ user: User; token: string; refreshToken?: string }> {
        const data = await this.request<{ user: User; token: string; refreshToken?: string }>(
            '/auth/demo-login',
            {
                method: 'POST',
                body: JSON.stringify({ userId }),
            }
        );
        this.setToken(data.token, data.refreshToken);
        return data;
    }

    static async login(
        identifier: string,
        password?: string
    ): Promise<{ user: User; token: string; refreshToken?: string }> {
        const data = await this.request<{ user: User; token: string; refreshToken?: string }>(
            '/auth/login',
            {
                method: 'POST',
                body: JSON.stringify({ identifier, password }),
            }
        );
        this.setToken(data.token, data.refreshToken);
        return data;
    }

    static async register(params: {
        phoneNumber: string;
        username: string;
        displayName: string;
        password?: string;
    }): Promise<{ user: User; token: string; refreshToken?: string }> {
        const data = await this.request<{ user: User; token: string; refreshToken?: string }>(
            '/auth/register',
            {
                method: 'POST',
                body: JSON.stringify(params),
            }
        );
        this.setToken(data.token, data.refreshToken);
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

    static async logout(): Promise<void> {
        try {
            const rToken = this.getRefreshToken();
            await this.request('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ refreshToken: rToken }),
            });
        } catch {
            // Ignore network errors during logout
        } finally {
            this.setToken(null, null);
        }
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

    static async markChatRead(
        chatId: string
    ): Promise<{ success: boolean; count: number; readMessageIds: string[] }> {
        return this.request(`/chats/${chatId}/read-all`, {
            method: 'POST',
        });
    }

    static async sendMessage(params: {
        chatId: string;
        content: string;
        type?: string;
        mediaUrl?: string;
        mediaName?: string;
        mediaSize?: number;
        replyToId?: string;
        waveform?: number[];
    }): Promise<{ message: Message }> {
        return this.request('/messages', {
            method: 'POST',
            body: JSON.stringify(params),
        });
    }

    static async editMessage(messageId: string, content: string): Promise<{ message: Message }> {
        return this.request(`/messages/${messageId}`, {
            method: 'PUT',
            body: JSON.stringify({ content }),
        });
    }

    static async deleteMessage(messageId: string): Promise<void> {
        return this.request(`/messages/${messageId}`, {
            method: 'DELETE',
        });
    }

    static async pinMessage(messageId: string): Promise<{ message: Message }> {
        return this.request(`/messages/${messageId}/pin`, {
            method: 'POST',
        });
    }

    static async unpinMessage(messageId: string): Promise<{ message: Message }> {
        return this.request(`/messages/${messageId}/unpin`, {
            method: 'POST',
        });
    }

    static async getPinnedMessages(chatId: string): Promise<{ messages: Message[] }> {
        return this.request(`/chats/${chatId}/pinned`);
    }

    static async addReaction(messageId: string, emoji: string): Promise<void> {
        return this.request(`/messages/${messageId}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji }),
        });
    }

    static async removeReaction(messageId: string, emoji: string): Promise<void> {
        return this.request(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
            method: 'DELETE',
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
    }): Promise<{
        media: {
            url: string;
            fileName: string;
            fileSize: number;
            mimeType: string;
            waveform?: number[];
        };
    }> {
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

    static async translateMessage(
        text: string,
        targetLang: string
    ): Promise<{ original: string; translated: string; targetLang: string }> {
        return this.request('/ai/translate', {
            method: 'POST',
            body: JSON.stringify({ text, targetLang }),
        });
    }

    static async queryAICopilot(prompt: string, context?: any): Promise<{ reply: string }> {
        return this.request('/ai/copilot', {
            method: 'POST',
            body: JSON.stringify({ prompt, context }),
        });
    }

    static async translateText(
        text: string,
        targetLang: string
    ): Promise<{ translatedText: string; detectedSourceLang: string }> {
        return this.request('/ai/translate', {
            method: 'POST',
            body: JSON.stringify({ text, targetLang }),
        });
    }

    static async semanticSearch(
        query: string,
        chatId?: string
    ): Promise<{ results: { message: Message; score: number; matchReason: string }[] }> {
        return this.request('/ai/semantic-search', {
            method: 'POST',
            body: JSON.stringify({ query, chatId }),
        });
    }

    static async transcribeVoice(
        audioUrl: string,
        duration?: number
    ): Promise<{ transcript: string; confidence: number; language: string }> {
        return this.request('/ai/transcribe-voice', {
            method: 'POST',
            body: JSON.stringify({ audioUrl, duration }),
        });
    }

    static async moderateContent(
        text: string,
        sensitivity?: 'LOW' | 'MEDIUM' | 'STRICT'
    ): Promise<{
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

    static async getCallSummary(
        durationSeconds: number,
        callerName: string
    ): Promise<{
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

    static async suggestGroupTopics(
        chatId: string,
        chatTitle?: string
    ): Promise<{
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

    static async getThreadMessages(
        parentMessageId: string
    ): Promise<{ parent: Message; messages: Message[] }> {
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

    static async unblockUser(
        userId: string
    ): Promise<{ success: boolean; unblocked_user_id: string }> {
        return this.request(`/users/${userId}/unblock`, {
            method: 'POST',
        });
    }

    static async getBlockedUsers(): Promise<{ blockedUserIds: string[] }> {
        return this.request('/users/blocked');
    }

    /**
     * Fetch dynamic, time-limited TURN credentials (HMAC-SHA1) from the backend
     * Never cached beyond the lifetime of a single call.
     */
    static async getTurnCredentials(): Promise<{
        urls: string[];
        username: string;
        credential: string;
        ttl: number;
    }> {
        return this.request('/turn-credentials');
    }
}
