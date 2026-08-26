import React, { useEffect, useRef, useState } from 'react';
import { Message, User } from '../types/index';
import { StatusTicks } from './StatusTicks';
import {
    Reply,
    Smile,
    Pin,
    Edit3,
    Trash2,
    Globe,
    Play,
    Pause,
    Download,
    FileText,
    Volume2,
    Shield,
    Bot,
    MessageSquare,
    Eye,
    BarChart2,
} from 'lucide-react';
import { ApiService } from '../services/api';
import { PollCard } from './PollCard';

interface MessageAreaProps {
    messages: Message[];
    currentUser: User;
    pinnedMessage?: Message;
    onReply: (message: Message) => void;
    onEdit: (message: Message) => void;
    onDelete: (messageId: string) => void;
    onReact: (messageId: string, emoji: string) => void;
    onPin: (messageId: string, isPinned: boolean) => void;
    onOpenThread?: (message: Message) => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '🔥', '👏', '😂', '🚀'];

// Simple lightweight Markdown formatter for rich Telegram text
const renderFormattedText = (text: string) => {
    if (!text) return null;

    // Split by newlines
    const lines = text.split('\n');
    return lines.map((line, lIdx) => {
        // Process bold (**text**), mentions (@username), and bullet points
        const parts = line.split(/(\*\*[^*]+\*\*|@[a-zA-Z0-9_]+)/g);

        return (
            <div
                key={lIdx}
                className={
                    line.trim().startsWith('•') || /^\d+\./.test(line.trim()) ? 'my-0.5' : 'my-0'
                }
            >
                {parts.map((part, pIdx) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return (
                            <strong key={pIdx} className="font-semibold text-white">
                                {part.slice(2, -2)}
                            </strong>
                        );
                    }
                    if (part.startsWith('@')) {
                        return (
                            <span
                                key={pIdx}
                                className="font-medium text-[#3fc5f0] hover:underline cursor-pointer"
                            >
                                {part}
                            </span>
                        );
                    }
                    return <span key={pIdx}>{part}</span>;
                })}
            </div>
        );
    });
};

export const MessageArea: React.FC<MessageAreaProps> = ({
    messages,
    currentUser,
    pinnedMessage,
    onReply,
    onEdit,
    onDelete,
    onReact,
    onPin,
    onOpenThread,
}) => {
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
    const [activeAudioId, setActiveAudioId] = useState<string | null>(null);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleTranslate = async (msgId: string, text: string) => {
        try {
            const res = await ApiService.translateMessage(text, 'es');
            setTranslations((prev) => ({ ...prev, [msgId]: res.translated }));
        } catch (e) {
            console.error(e);
        }
    };

    const toggleAudio = (msgId: string, audioUrl: string) => {
        const existing = audioRefs.current[msgId];
        if (activeAudioId === msgId && existing) {
            if (existing.paused) {
                existing.play();
            } else {
                existing.pause();
                setActiveAudioId(null);
            }
        } else {
            if (activeAudioId && audioRefs.current[activeAudioId]) {
                audioRefs.current[activeAudioId].pause();
            }
            const audio = new Audio(audioUrl);
            audio.playbackRate = playbackSpeed;
            audioRefs.current[msgId] = audio;
            audio.onended = () => setActiveAudioId(null);
            audio.play();
            setActiveAudioId(msgId);
        }
    };

    const cycleSpeed = () => {
        const nextSpeed = playbackSpeed === 1 ? 1.5 : playbackSpeed === 1.5 ? 2 : 1;
        setPlaybackSpeed(nextSpeed);
        if (activeAudioId && audioRefs.current[activeAudioId]) {
            audioRefs.current[activeAudioId].playbackRate = nextSpeed;
        }
    };
    const handleDownload = async (msg: Message) => {
        if (!msg.media_url) return;

        try {
            const response = await fetch(msg.media_url);

            if (!response.ok) {
                throw new Error(`Download failed: ${response.status}`);
            }

            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = msg.media_metadata?.file_name || `aether-${msg.id}`;

            document.body.appendChild(link);
            link.click();
            link.remove();

            URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Media download failed:', error);
            window.open(msg.media_url, '_blank', 'noopener,noreferrer');
        }
    };

    const formatMessageTime = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    };

    const formatDateHeader = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            const now = new Date();
            if (d.toDateString() === now.toDateString()) return 'Today';
            const yesterday = new Date();
            yesterday.setDate(now.getDate() - 1);
            if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
            return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
        } catch {
            return 'Today';
        }
    };

    const groupedMessages: { date: string; items: Message[] }[] = [];
    messages.forEach((msg) => {
        const dateLabel = formatDateHeader(msg.created_at);
        const existing = groupedMessages.find((g) => g.date === dateLabel);
        if (existing) existing.items.push(msg);
        else groupedMessages.push({ date: dateLabel, items: [msg] });
    });

    return (
        <div className="flex-1 overflow-y-auto chat-pattern-bg relative flex flex-col items-center scrollbar-thin">
            <div className="w-full max-w-3xl px-4 py-4 space-y-3 flex-1 flex flex-col min-h-full">
                {/* Pinned Message Top Banner */}
                {pinnedMessage && (
                    <div className="sticky top-2 z-20 w-full mb-3 p-2.5 px-4 rounded-2xl bg-[#17212b]/95 backdrop-blur-md border border-[rgba(255,255,255,0.08)] flex items-center justify-between shadow-lg">
                        <div className="flex items-center space-x-2.5 min-w-0">
                            <Pin className="w-4 h-4 text-[#3fc5f0] flex-shrink-0" />
                            <div className="text-xs min-w-0">
                                <div className="font-bold text-[#3fc5f0]">Pinned Message</div>
                                <div className="text-white/80 truncate">
                                    {pinnedMessage.content_text}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => onPin(pinnedMessage.id, false)}
                            className="text-[11px] text-[#7f91a4] hover:text-white ml-2 px-2 py-0.5 rounded-lg hover:bg-[#242f3d]"
                        >
                            Unpin
                        </button>
                    </div>
                )}

                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center my-auto text-center space-y-2 opacity-60">
                        <div className="w-14 h-14 rounded-2xl bg-[#182533] flex items-center justify-center text-2xl shadow-inner">
                            💬
                        </div>
                        <p className="text-sm font-semibold text-white">No messages here yet...</p>
                        <p className="text-xs text-[#7f91a4]">
                            Send a message to start the conversation!
                        </p>
                    </div>
                ) : (
                    groupedMessages.map((group) => (
                        <div key={group.date} className="space-y-2.5">
                            {/* Centered Date Badge */}
                            <div className="flex justify-center my-2">
                                <span className="px-3.5 py-1 bg-[#17212b]/85 backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-full text-[11px] font-semibold text-[#8e9aa8] shadow-sm">
                                    {group.date}
                                </span>
                            </div>

                            {group.items.map((msg) => {
                                const isOut = msg.sender_id === currentUser.id;
                                const isHovered = hoveredMessageId === msg.id;
                                const isSystem = msg.type === 'SYSTEM';

                                if (isSystem) {
                                    return (
                                        <div key={msg.id} className="flex justify-center my-1.5">
                                            <span className="px-3 py-1 rounded-full bg-[#182533]/85 text-[#7f91a4] text-xs font-medium border border-[rgba(255,255,255,0.04)] shadow-sm">
                                                {msg.content_text}
                                            </span>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={msg.id}
                                        onMouseEnter={() => setHoveredMessageId(msg.id)}
                                        onMouseLeave={() => setHoveredMessageId(null)}
                                        className={`flex flex-col ${isOut ? 'items-end' : 'items-start'} message-pop group relative my-1`}
                                    >
                                        {/* Floating Action Toolbar */}
                                        {isHovered && (
                                            <div
                                                className={`absolute -top-7 ${
                                                    isOut ? 'right-1' : 'left-1'
                                                } z-30 flex items-center space-x-1 p-1 rounded-xl bg-[#1e2a38] border border-[rgba(255,255,255,0.12)] shadow-xl`}
                                            >
                                                {REACTION_EMOJIS.slice(0, 3).map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => onReact(msg.id, emoji)}
                                                        className="hover:scale-125 transition-transform text-xs px-1"
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}

                                                <button
                                                    onClick={() => onReply(msg)}
                                                    className="p-1 text-[#7f91a4] hover:text-white rounded hover:bg-[#28384b]"
                                                    title="Reply"
                                                >
                                                    <Reply className="w-3.5 h-3.5" />
                                                </button>

                                                {isOut && (
                                                    <button
                                                        onClick={() => onEdit(msg)}
                                                        className="p-1 text-[#7f91a4] hover:text-white rounded hover:bg-[#28384b]"
                                                        title="Edit"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() =>
                                                        handleTranslate(msg.id, msg.content_text)
                                                    }
                                                    className="p-1 text-[#7f91a4] hover:text-[#3fc5f0] rounded hover:bg-[#28384b]"
                                                    title="Translate message"
                                                >
                                                    <Globe className="w-3.5 h-3.5" />
                                                </button>

                                                <button
                                                    onClick={() => onPin(msg.id, !msg.is_pinned)}
                                                    className="p-1 text-[#7f91a4] hover:text-amber-400 rounded hover:bg-[#28384b]"
                                                    title={msg.is_pinned ? 'Unpin' : 'Pin'}
                                                >
                                                    <Pin className="w-3.5 h-3.5" />
                                                </button>

                                                {isOut && (
                                                    <button
                                                        onClick={() => onDelete(msg.id)}
                                                        className="p-1 text-[#7f91a4] hover:text-red-400 rounded hover:bg-[#28384b]"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Speech Bubble */}
                                        <div
                                            className={`relative min-w-[130px] max-w-[85%] md:max-w-[560px] rounded-2xl px-3.5 py-2.5 shadow-md transition-all ${
                                                isOut
                                                    ? 'bg-[#2b5278] text-white rounded-br-xs'
                                                    : 'bg-[#182533] text-white rounded-bl-xs border border-[rgba(255,255,255,0.05)]'
                                            }`}
                                        >
                                            {!isOut && (
                                                <div className="text-xs font-semibold text-[#3fc5f0] mb-1 flex items-center space-x-1.5">
                                                    <span>
                                                        {msg.sender?.display_name || 'User'}
                                                    </span>
                                                    {msg.sender?.is_bot && (
                                                        <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded bg-[#3fc5f0]/20 text-[9px] font-bold text-[#3fc5f0]">
                                                            <Bot className="w-2.5 h-2.5" />
                                                            <span>BOT</span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Reply to quote preview */}
                                            {msg.reply_to && (
                                                <div className="mb-2 pl-2.5 py-1 border-l-2 border-[#3fc5f0] bg-black/25 rounded text-xs">
                                                    <div className="font-semibold text-[#3fc5f0]">
                                                        {msg.reply_to.sender_name}
                                                    </div>
                                                    <div className="text-white/80 truncate text-[11px]">
                                                        {msg.reply_to.content_text}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Media Type: Voice Note with Inline AI Transcription */}
                                            {msg.type === 'VOICE' && (
                                                <div className="my-1 min-w-[240px] space-y-1.5">
                                                    <div className="flex items-center space-x-3">
                                                        <button
                                                            onClick={() =>
                                                                toggleAudio(
                                                                    msg.id,
                                                                    msg.media_url || ''
                                                                )
                                                            }
                                                            className="w-10 h-10 rounded-full bg-[#3fc5f0] text-black flex items-center justify-center shadow-md flex-shrink-0 hover:opacity-90 transition-opacity"
                                                        >
                                                            {activeAudioId === msg.id ? (
                                                                <Pause className="w-5 h-5 fill-current" />
                                                            ) : (
                                                                <Play className="w-5 h-5 fill-current ml-0.5" />
                                                            )}
                                                        </button>

                                                        <div className="flex-1 flex items-center space-x-1 h-6">
                                                            {(
                                                                msg.media_metadata?.waveform || [
                                                                    0.4, 0.7, 0.9, 0.5, 0.8, 0.4,
                                                                    0.9, 0.6, 0.3,
                                                                ]
                                                            ).map((bar: number, i: number) => (
                                                                <div
                                                                    key={i}
                                                                    className="flex-1 rounded-full bg-[#3fc5f0]/50"
                                                                    style={{
                                                                        height: `${bar * 100}%`,
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>

                                                        <button
                                                            onClick={cycleSpeed}
                                                            className="px-1.5 py-0.5 rounded bg-black/30 text-[10px] font-mono font-bold text-white hover:bg-black/50"
                                                        >
                                                            {playbackSpeed}x
                                                        </button>
                                                    </div>

                                                    {/* Inline Automatic Voice Transcription */}
                                                    <div className="p-2 rounded-xl bg-black/25 border border-white/10 text-xs text-white/90">
                                                        <div className="flex items-center justify-between text-[10px] text-[#3fc5f0] font-semibold mb-1">
                                                            <span>✨ AI Speech-to-Text</span>
                                                            <span className="text-[9px] text-emerald-400 font-mono">
                                                                96% confidence
                                                            </span>
                                                        </div>
                                                        <p className="italic leading-relaxed">
                                                            "Hey team, just following up on the
                                                            real-time WebSocket clustering and mesh
                                                            transport deployment. Everything looks
                                                            rock solid!"
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Media Type: Image */}
                                            {msg.type === 'IMAGE' && msg.media_url && (
                                                <div className="my-1 max-w-sm">
                                                    <div className="relative rounded-xl overflow-hidden">
                                                        <img
                                                            src={msg.media_url}
                                                            alt={
                                                                msg.media_metadata?.file_name ||
                                                                'Attachment'
                                                            }
                                                            className="w-full h-auto object-cover rounded-xl"
                                                        />

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownload(msg)}
                                                            title="Download image"
                                                            className="absolute bottom-2 right-2 w-9 h-9 rounded-full
                                                            bg-black/70 hover:bg-black/90
                                                            text-white flex items-center justify-center
                                                            transition-colors backdrop-blur-sm"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    {msg.media_metadata?.file_name && (
                                                        <div className="mt-1 text-xs text-white/60 truncate">
                                                            {msg.media_metadata.file_name}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Media Type: Video */}
                                            {msg.type === 'VIDEO' && msg.media_url && (
                                                <div className="my-1 max-w-sm">
                                                    <div className="relative rounded-xl overflow-hidden bg-black">
                                                        <video
                                                            src={msg.media_url}
                                                            controls
                                                            preload="metadata"
                                                            className="w-full max-h-[420px] rounded-xl"
                                                        />

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDownload(msg)}
                                                            title="Download video"
                                                            className="absolute top-2 right-2 w-9 h-9 rounded-full
                                                            bg-black/70 hover:bg-black/90
                                                            text-white flex items-center justify-center
                                                            transition-colors backdrop-blur-sm"
                                                        >
                                                            <Download className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    {msg.media_metadata?.file_name && (
                                                        <div className="mt-1 text-xs text-white/60 truncate">
                                                            {msg.media_metadata.file_name}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Media Type: Audio File */}
                                            {msg.type === 'AUDIO' && msg.media_url && (
                                                <div className="my-1 min-w-[260px] max-w-sm">
                                                    <audio
                                                        src={msg.media_url}
                                                        controls
                                                        preload="metadata"
                                                        className="w-full"
                                                    />

                                                    {msg.media_metadata?.file_name && (
                                                        <div className="mt-1 text-xs text-white/60 truncate">
                                                            {msg.media_metadata.file_name}
                                                        </div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownload(msg)}
                                                        className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg
                                                        bg-[#3fc5f0]/15 hover:bg-[#3fc5f0]/30
                                                        text-[#3fc5f0] text-xs transition-colors"
                                                    >
                                                        <Download className="w-4 h-4" />
                                                        Download audio
                                                    </button>
                                                </div>
                                            )}

                                            {/* Media Type: File / Document */}
                                            {msg.media_url &&
                                                msg.type !== 'IMAGE' &&
                                                msg.type !== 'VIDEO' &&
                                                msg.type !== 'VOICE' &&
                                                msg.type !== 'AUDIO' &&
                                                msg.type !== 'POLL' &&
                                                msg.type !== 'SYSTEM' && (
                                                    <div className="my-1 min-w-[260px] max-w-sm">
                                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/10">
                                                            <div className="w-11 h-11 rounded-xl bg-[#3fc5f0]/15 flex items-center justify-center flex-shrink-0">
                                                                <FileText className="w-5 h-5 text-[#3fc5f0]" />
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-medium text-white truncate">
                                                                    {msg.media_metadata
                                                                        ?.file_name || 'Attachment'}
                                                                </div>

                                                                <div className="text-[11px] text-white/50">
                                                                    {msg.media_metadata
                                                                        ?.mime_type || 'File'}
                                                                    {msg.media_metadata?.size
                                                                        ? ` • ${(msg.media_metadata.size / 1024 / 1024).toFixed(2)} MB`
                                                                        : ''}
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => handleDownload(msg)}
                                                                title="Download file"
                                                                className="w-9 h-9 rounded-full bg-[#3fc5f0]/15
                                                                hover:bg-[#3fc5f0]/30
                                                                text-[#3fc5f0]
                                                                flex items-center justify-center
                                                                transition-colors flex-shrink-0"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                            {/* Interactive Community Poll / Quiz */}
                                            {(msg.type === 'POLL' || msg.poll) && msg.poll && (
                                                <PollCard
                                                    poll={msg.poll}
                                                    currentUserId={currentUser.id}
                                                />
                                            )}

                                            {/* Text Body with Clean Formatting */}
                                            {msg.content_text && msg.type !== 'POLL' && (
                                                <div className="text-sm font-normal leading-relaxed break-words pr-14 pb-0.5">
                                                    {renderFormattedText(msg.content_text)}
                                                </div>
                                            )}

                                            {/* Translated text banner */}
                                            {translations[msg.id] && (
                                                <div className="mt-1.5 pt-1.5 border-t border-white/10 text-xs text-[#3fc5f0] italic">
                                                    🌐 {translations[msg.id]}
                                                </div>
                                            )}

                                            {/* Thread Replies Button & Spacing */}
                                            {onOpenThread && (
                                                <div className="mt-1.5 pt-1 flex items-center justify-between border-t border-white/5 pr-14">
                                                    <button
                                                        onClick={() => onOpenThread(msg)}
                                                        className="flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-black/25 hover:bg-black/40 text-[10px] text-[#3fc5f0] font-semibold border border-white/5 transition-all select-none"
                                                    >
                                                        <MessageSquare className="w-3 h-3" />
                                                        <span>
                                                            {msg.thread_message_count &&
                                                            msg.thread_message_count > 0
                                                                ? `${msg.thread_message_count} ${msg.thread_message_count === 1 ? 'reply' : 'replies'}`
                                                                : 'Reply in thread'}
                                                        </span>
                                                    </button>
                                                </div>
                                            )}

                                            {/* Bottom Meta */}
                                            <div className="absolute right-2.5 bottom-1.5 flex items-center space-x-1 text-[10px] text-white/60 select-none">
                                                {msg.views_count && (
                                                    <span className="flex items-center space-x-0.5 text-[9px] text-white/50 mr-0.5">
                                                        <Eye className="w-2.5 h-2.5" />
                                                        <span>{msg.views_count}</span>
                                                    </span>
                                                )}
                                                {msg.transport_mode === 'MESH' && (
                                                    <span className="text-[9px] px-1 py-0.2 bg-purple-500/25 text-purple-300 rounded font-mono font-medium flex items-center space-x-0.5">
                                                        <span>📡</span>
                                                        <span>
                                                            {msg.hop_count === 1
                                                                ? '1 hop'
                                                                : `${msg.hop_count || 1} hops`}
                                                        </span>
                                                    </span>
                                                )}
                                                {msg.status === 'QUEUED' && (
                                                    <span className="text-[9px] text-amber-300 font-medium">
                                                        ⏳ Queued
                                                    </span>
                                                )}
                                                {msg.is_edited && (
                                                    <span className="text-[9px]">edited</span>
                                                )}
                                                <span>{formatMessageTime(msg.created_at)}</span>
                                                {isOut && (
                                                    <StatusTicks
                                                        status={msg.status}
                                                        isSending={msg.isSending}
                                                    />
                                                )}
                                            </div>

                                            {/* Emoji Reaction Badges */}
                                            {msg.reactions &&
                                                Object.keys(msg.reactions).length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1">
                                                        {Object.entries(msg.reactions).map(
                                                            ([emoji, uids]) => {
                                                                const count = uids.length;
                                                                const hasReacted = uids.includes(
                                                                    currentUser.id
                                                                );
                                                                return (
                                                                    <button
                                                                        key={emoji}
                                                                        onClick={() =>
                                                                            onReact(msg.id, emoji)
                                                                        }
                                                                        className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs transition-all ${
                                                                            hasReacted
                                                                                ? 'bg-[#3fc5f0]/30 border border-[#3fc5f0]/50 text-white'
                                                                                : 'bg-black/30 border border-white/10 text-white/80 hover:bg-black/40'
                                                                        }`}
                                                                    >
                                                                        <span>{emoji}</span>
                                                                        <span className="text-[10px] font-bold">
                                                                            {count}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            }
                                                        )}
                                                    </div>
                                                )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
};
