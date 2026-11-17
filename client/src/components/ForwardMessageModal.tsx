import React, { useMemo, useState } from 'react';
import { X, Forward, Search, EyeOff } from 'lucide-react';
import { Chat, Message } from '../types/index';
import { E2EEService } from '../services/e2ee';
import { offlineStorage } from '../services/storage';
import { ApiService } from '../services/api';
import { UserAvatar } from './UserAvatar';

interface ForwardMessageModalProps {
    message: Message;
    userId: string;
    deviceId: number;
    chats: Chat[];
    /** Chat the message currently lives in — pre-checked by default. */
    currentChatId?: string;
    onClose: () => void;
    onForwarded: (targetChatIds: string[], messages: Message[]) => void;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
    message,
    userId,
    deviceId,
    chats,
    currentChatId,
    onClose,
    onForwarded,
}) => {
    const [selected, setSelected] = useState<Set<string>>(
        () => new Set(currentChatId ? [] : [])
    );
    const [hideAttribution, setHideAttribution] = useState(false);
    const [search, setSearch] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filteredChats = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return chats;
        return chats.filter((c) => {
            const title = (c.title || c.peer_user?.display_name || '').toLowerCase();
            return title.includes(q);
        });
    }, [chats, search]);

    const toggle = (chatId: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(chatId) ? next.delete(chatId) : next.add(chatId);
            return next;
        });
    };

    const handleForward = async () => {
        if (selected.size === 0 || sending) return;
        setSending(true);
        setError(null);
        try {
            const source = { ...message };
            await E2EEService.decryptIncoming(source, userId, deviceId,
                chats.find(c => c.id === source.chat_id)?.peer_user?.id,
                chats.find(c => c.id === source.chat_id));
            if (source.ciphertext_payload && (!source.content_text || /^\[(Encrypted|Unable|Untrusted|No envelope)/.test(source.content_text))) {
                throw new Error('Open and decrypt this message before forwarding it.');
            }
            const destinationPayloads: Record<string, string> = {};
            for (const id of selected) {
                const destination = chats.find(c => c.id === id);
                if (!destination) throw new Error('Destination chat is unavailable.');
                if (source.content_text) {
                    const sealed = await E2EEService.sealForChat(source.content_text, destination, userId, deviceId);
                    if (sealed !== '__PLAINTEXT__') destinationPayloads[id] = sealed;
                    else if (source.ciphertext_payload) throw new Error('This destination cannot receive encrypted forwards.');
                }
            }
            const response = await ApiService.forwardMessage(message.id, Array.from(selected), hideAttribution, destinationPayloads);
            const opened = response.messages.map(m => ({ ...m, content_text: source.content_text }));
            await offlineStorage.saveMessagesLocally(opened);
            onForwarded(Array.from(selected), opened);
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Failed to forward message');
        } finally {
            setSending(false);
        }
    };

    const chatTitle = (c: Chat) =>
        c.title || c.peer_user?.display_name || c.peer_user?.username || 'Chat';

    const previewText =
        message.type === 'TEXT'
            ? message.content_text
            : `[${message.type.toLowerCase()}]`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in pointer-events-none">
            <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)] flex flex-col max-h-[80vh] pointer-events-auto">
                {/* Header */}
                <div className="p-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                        <div className="p-2 rounded-xl bg-[#2b5278]/40 border border-[#2b5278]/60 text-[#3fc5f0]">
                            <Forward className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white">Forward message</h2>
                            <p className="text-[11px] text-[#7f91a4] truncate max-w-[240px]">
                                {previewText}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-[#7f91a4] hover:text-white hover:bg-[#202b36] transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-[rgba(255,255,255,0.06)]">
                    <div className="flex items-center space-x-2 px-3 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl">
                        <Search className="w-4 h-4 text-[#7f91a4]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search chats..."
                            className="flex-1 bg-transparent text-white text-xs outline-none placeholder-[#7f91a4]"
                        />
                    </div>
                </div>

                {/* Chat list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {filteredChats.length === 0 && (
                        <p className="text-center text-xs text-[#7f91a4] py-6">No chats found</p>
                    )}
                    {filteredChats.map((chat) => (
                        <button
                            key={chat.id}
                            onClick={() => toggle(chat.id)}
                            className={`w-full flex items-center space-x-3 p-2.5 rounded-2xl transition-colors text-left ${
                                selected.has(chat.id)
                                    ? 'bg-[#2b5278]/50 border border-[#3fc5f0]/40'
                                    : 'hover:bg-[#202b36] border border-transparent'
                            }`}
                        >
                            <UserAvatar
                                name={chatTitle(chat)}
                                avatarUrl={chat.avatar_url || chat.peer_user?.avatar_url}
                                size="sm"
                            />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">
                                    {chatTitle(chat)}
                                </p>
                                <p className="text-[11px] text-[#7f91a4] capitalize">
                                    {chat.type.toLowerCase()}
                                </p>
                            </div>
                            <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                    selected.has(chat.id)
                                        ? 'bg-[#3fc5f0] border-[#3fc5f0]'
                                        : 'border-[#7f91a4]/50'
                                }`}
                            >
                                {selected.has(chat.id) && (
                                    <span className="text-black text-[10px] font-bold">✓</span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {error && (
                    <div className="mx-3 mb-2 p-2.5 bg-red-500/15 border border-red-500/30 text-red-300 text-xs rounded-xl">
                        {error}
                    </div>
                )}

                {/* Footer */}
                <div className="p-3 border-t border-[rgba(255,255,255,0.06)] space-y-2.5">
                    <button
                        onClick={() => setHideAttribution((v) => !v)}
                        className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl hover:bg-[#202b36] transition-colors text-left"
                    >
                        <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                hideAttribution
                                    ? 'bg-[#3fc5f0] border-[#3fc5f0]'
                                    : 'border-[#7f91a4]/50'
                            }`}
                        >
                            {hideAttribution && (
                                <span className="text-black text-[9px] font-bold">✓</span>
                            )}
                        </div>
                        <EyeOff className="w-3.5 h-3.5 text-[#7f91a4]" />
                        <span className="text-xs text-[#c4d2e0]">Hide sender name</span>
                    </button>

                    <button
                        onClick={handleForward}
                        disabled={selected.size === 0 || sending}
                        className="w-full py-2.5 bg-[#2b5278] hover:bg-[#34618f] disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-white text-sm font-bold transition-all flex items-center justify-center space-x-2"
                    >
                        <Forward className="w-4 h-4" />
                        <span>
                            {sending
                                ? 'Forwarding...'
                                : `Forward${selected.size > 0 ? ` (${selected.size})` : ''}`}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
};
