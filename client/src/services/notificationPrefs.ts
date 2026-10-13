// Notification preferences: custom sounds, per-chat notify modes and
// mention-only filtering. All settings persist to localStorage (client-side
// only) and are read on every notification so changes apply immediately.
//
// Persistence keys:
//   notifSound                -> global NotificationSoundId ('default' | 'subtle' | ...)
//   notifSound:<chatId>       -> per-chat NotificationSoundId (overrides global)
//   notifMentionsOnly         -> '1' | '0' global "Notify on mentions only" toggle
//   notifMode:<chatId>        -> 'all' | 'mentions' | 'muted' per-chat notify mode

import { Chat, Message } from '../types/index';
import { sounds, NotificationSoundId, DEFAULT_NOTIFICATION_SOUND } from './sound';

export type ChatNotifyMode = 'all' | 'mentions' | 'muted';

const KEY_GLOBAL_SOUND = 'notifSound';
const KEY_MENTIONS_ONLY = 'notifMentionsOnly';

function lsGet(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function lsSet(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage unavailable (private mode etc.)
    }
}

function lsRemove(key: string) {
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore
    }
}

export const NotificationPrefs = {
    // --- Global notification sound ---
    getGlobalSound(): NotificationSoundId {
        const v = lsGet(KEY_GLOBAL_SOUND);
        return (v || DEFAULT_NOTIFICATION_SOUND) as NotificationSoundId;
    },
    setGlobalSound(id: NotificationSoundId) {
        lsSet(KEY_GLOBAL_SOUND, id);
    },

    // --- Per-chat notification sound (null = inherit global) ---
    getChatSound(chatId: string): NotificationSoundId | null {
        const v = lsGet(`${KEY_GLOBAL_SOUND}:${chatId}`);
        return (v as NotificationSoundId | null) ?? null;
    },
    setChatSound(chatId: string, id: NotificationSoundId | null) {
        if (id) lsSet(`${KEY_GLOBAL_SOUND}:${chatId}`, id);
        else lsRemove(`${KEY_GLOBAL_SOUND}:${chatId}`);
    },

    /** Resolve the effective sound for a chat: per-chat override > global. */
    resolveSound(chatId: string): NotificationSoundId {
        return this.getChatSound(chatId) ?? this.getGlobalSound();
    },

    // --- Global "mentions only" toggle ---
    getGlobalMentionsOnly(): boolean {
        return lsGet(KEY_MENTIONS_ONLY) === '1';
    },
    setGlobalMentionsOnly(on: boolean) {
        lsSet(KEY_MENTIONS_ONLY, on ? '1' : '0');
    },

    // --- Per-chat notify mode (null = follow global setting) ---
    getChatMode(chatId: string): ChatNotifyMode | null {
        const v = lsGet(`notifMode:${chatId}`);
        return v === 'all' || v === 'mentions' || v === 'muted' ? v : null;
    },
    setChatMode(chatId: string, mode: ChatNotifyMode | null) {
        if (mode) lsSet(`notifMode:${chatId}`, mode);
        else lsRemove(`notifMode:${chatId}`);
    },

    /**
     * Effective mode for a chat. A hard per-chat override wins; otherwise the
     * global mentions-only toggle decides between 'all' and 'mentions'.
     */
    resolveMode(chatId: string): ChatNotifyMode {
        return this.getChatMode(chatId) ?? (this.getGlobalMentionsOnly() ? 'mentions' : 'all');
    },

    // --- Mention detection ---
    isMention(message: Message, currentUserId: string | null, currentUsername?: string | null): boolean {
        if (!currentUserId) return false;

        // A reply to one of my messages always counts as a mention.
        if (message.reply_to?.sender_id === currentUserId) return true;

        // "@username" in the body, case-insensitive.
        if (currentUsername && message.content_text) {
            return message.content_text
                .toLowerCase()
                .includes(`@${currentUsername.toLowerCase()}`);
        }

        return false;
    },

    /**
     * Decide whether an incoming message should produce a notification
     * (sound / alert). Considers the backend is_muted flag, the per-chat
     * notify mode, the global mentions-only toggle, and mention detection.
     */
    shouldNotify(
        chat: Chat | null,
        message: Message,
        currentUserId: string | null,
        currentUsername?: string | null
    ): boolean {
        // Server-side mute (chat_members.is_muted) always wins.
        if (chat?.is_muted) return false;

        const mode = this.resolveMode(message.chat_id);
        if (mode === 'muted') return false;
        if (mode === 'all') return true;

        // mode === 'mentions'
        return this.isMention(message, currentUserId, currentUsername);
    },

    /** Play the resolved notification sound for a chat. */
    playChatSound(chatId: string) {
        sounds.playNotification(this.resolveSound(chatId));
    },
};
