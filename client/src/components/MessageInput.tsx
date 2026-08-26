import React, { useState, useRef, useEffect } from 'react';
import {
    Send,
    Smile,
    Paperclip,
    Mic,
    X,
    Image,
    FileText,
    MapPin,
    Sparkles,
    Check,
    Edit3,
} from 'lucide-react';
import { Message } from '../types/index';
import { VoiceRecorder } from './VoiceRecorder';
import { ApiService } from '../services/api';

interface MessageInputProps {
    chatId: string;
    replyToMessage: Message | null;
    editingMessage: Message | null;
    onClearReply: () => void;
    onClearEdit: () => void;
    onSendMessage: (
        text: string,
        replyToId?: string,
        mediaUrl?: string,
        mediaType?: any,
        mediaMetadata?: any
    ) => void;
    onEditSubmit: (messageId: string, newText: string) => void;
    onTyping: (isTyping: boolean) => void;
}

const COMMON_EMOJIS = [
    '👍',
    '❤️',
    '🔥',
    '🎉',
    '😂',
    '🚀',
    '✨',
    '👏',
    '👀',
    '💯',
    '🙏',
    '⚡',
    '🔐',
    '💡',
    '🤖',
    '🤝',
];

export const MessageInput: React.FC<MessageInputProps> = ({
    chatId,
    replyToMessage,
    editingMessage,
    onClearReply,
    onClearEdit,
    onSendMessage,
    onEditSubmit,
    onTyping,
}) => {
    const [text, setText] = useState('');
    const [isVoiceRecording, setIsVoiceRecording] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showAttachMenu, setShowAttachMenu] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const typingTimeoutRef = useRef<any>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (editingMessage) {
            setText(editingMessage.content_text);
        }
        inputRef.current?.focus();
    }, [chatId, replyToMessage, editingMessage]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);

        onTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
    };

    const handleSend = () => {
        const trimmed = text.trim();
        if (!trimmed) return;

        if (editingMessage) {
            onEditSubmit(editingMessage.id, trimmed);
            onClearEdit();
        } else {
            onSendMessage(trimmed, replyToMessage?.id);
            onClearReply();
        }

        setText('');
        onTyping(false);
        setShowEmojiPicker(false);
        setShowAttachMenu(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSendVoiceNote = async (
        audioBase64: string,
        mimeType: string,
        duration: number,
        waveform: number[]
    ) => {
        setIsVoiceRecording(false);

        try {
            const cleanMimeType = mimeType.split(';')[0];

            const extension = cleanMimeType === 'audio/ogg' ? 'ogg' : 'webm';

            const fileName = `voice_note_${Date.now()}.${extension}`;

            console.log('Uploading voice note:', {
                fileName,
                mimeType: cleanMimeType,
                duration,
            });

            const res = await ApiService.uploadMedia({
                base64Data: audioBase64,
                fileName,
                mimeType: cleanMimeType,
                waveform,
            });

            if (!res?.media?.url) {
                throw new Error('Server did not return a media URL.');
            }

            onSendMessage('', replyToMessage?.id, res.media.url, 'VOICE', {
                duration,
                waveform,
                mime_type: cleanMimeType,
                file_name: fileName,
            });

            onClearReply();
        } catch (err) {
            console.error('Failed to send voice note:', err);
        }
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setShowAttachMenu(false);

        try {
            const reader = new FileReader();

            reader.onloadend = async () => {
                try {
                    const base64Data = reader.result as string;

                    const isImg = file.type.startsWith('image/');
                    const isVideo = file.type.startsWith('video/');
                    const isAudio = file.type.startsWith('audio/');

                    let mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' = 'FILE';

                    if (isImg) {
                        mediaType = 'IMAGE';
                    } else if (isVideo) {
                        mediaType = 'VIDEO';
                    } else if (isAudio) {
                        mediaType = 'AUDIO';
                    }

                    const res = await ApiService.uploadMedia({
                        base64Data,
                        fileName: file.name,
                        mimeType: file.type,
                    });

                    const contentText =
                        mediaType === 'IMAGE' || mediaType === 'VIDEO' || mediaType === 'AUDIO'
                            ? ''
                            : `📎 Shared file: ${file.name} (${Math.round(file.size / 1024)} KB)`;

                    onSendMessage(contentText, replyToMessage?.id, res.media.url, mediaType, {
                        file_name: file.name,
                        size: file.size,
                        mime_type: file.type,
                    });

                    setIsUploading(false);

                    // Allow selecting the same file again later.
                    e.target.value = '';
                } catch (err) {
                    console.error('File upload error', err);
                    setIsUploading(false);
                }
            };

            reader.onerror = () => {
                console.error('Failed to read selected file');
                setIsUploading(false);
            };

            reader.readAsDataURL(file);
        } catch (err) {
            console.error('File upload error', err);
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full bg-[#0e1621] px-4 pb-4 pt-1 flex justify-center select-none">
            <div className="w-full max-w-3xl relative">
                {/* Hidden File Picker Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelected}
                    className="hidden"
                />

                {/* Reply Banner */}
                {replyToMessage && (
                    <div className="flex items-center justify-between px-3.5 py-2 mb-2 bg-[#17212b] border-l-2 border-[#3fc5f0] rounded-r-xl border border-[rgba(255,255,255,0.06)] shadow-sm">
                        <div className="text-xs min-w-0">
                            <div className="font-semibold text-[#3fc5f0]">
                                Replying to {replyToMessage.sender?.display_name || 'User'}
                            </div>
                            <div className="text-[#7f91a4] truncate">
                                {replyToMessage.content_text}
                            </div>
                        </div>
                        <button
                            onClick={onClearReply}
                            className="p-1 text-[#7f91a4] hover:text-white rounded-lg"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Editing Banner */}
                {editingMessage && (
                    <div className="flex items-center justify-between px-3.5 py-2 mb-2 bg-[#17212b] border-l-2 border-amber-400 rounded-r-xl border border-[rgba(255,255,255,0.06)] shadow-sm">
                        <div className="text-xs min-w-0 flex items-center space-x-2">
                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-semibold text-amber-400">Editing Message</span>
                        </div>
                        <button
                            onClick={onClearEdit}
                            className="p-1 text-[#7f91a4] hover:text-white rounded-lg"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Emoji Picker Popover */}
                {showEmojiPicker && (
                    <div className="absolute bottom-16 left-2 z-20 p-3 bg-[#1e2a38] border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl flex flex-wrap gap-2 max-w-[300px]">
                        {COMMON_EMOJIS.map((emoji) => (
                            <button
                                key={emoji}
                                onClick={() => {
                                    setText((prev) => prev + emoji);
                                    inputRef.current?.focus();
                                }}
                                className="text-lg hover:scale-125 transition-transform p-1 rounded hover:bg-[#28384b]"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}

                {/* Attachment Popover */}
                {showAttachMenu && (
                    <div className="absolute bottom-16 left-10 z-20 p-2 bg-[#1e2a38] border border-[rgba(255,255,255,0.1)] rounded-2xl shadow-2xl space-y-1 w-48">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                        >
                            <Image className="w-4 h-4 text-[#3fc5f0]" />
                            <span>Photo or Video</span>
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                        >
                            <FileText className="w-4 h-4 text-amber-400" />
                            <span>Document / File</span>
                        </button>
                        <button
                            onClick={() => {
                                setText((prev) => prev + ' 🤖 @ai summarize this thread ');
                                setShowAttachMenu(false);
                            }}
                            className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                        >
                            <Sparkles className="w-4 h-4 text-[#3fc5f0]" />
                            <span>Ask Aether AI</span>
                        </button>
                    </div>
                )}

                {/* Main Floating Input Bar */}
                {isVoiceRecording ? (
                    <VoiceRecorder
                        onCancel={() => setIsVoiceRecording(false)}
                        onRecordingComplete={handleSendVoiceNote}
                    />
                ) : (
                    <div className="flex items-center space-x-2 bg-[#17212b] border border-[rgba(255,255,255,0.08)] rounded-2xl p-1.5 shadow-lg">
                        <button
                            onClick={() => {
                                setShowEmojiPicker(!showEmojiPicker);
                                setShowAttachMenu(false);
                            }}
                            className={`p-2.5 rounded-xl transition-all ${
                                showEmojiPicker
                                    ? 'text-[#3fc5f0] bg-[#242f3d]'
                                    : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
                            }`}
                            title="Emojis"
                        >
                            <Smile className="w-5 h-5" />
                        </button>

                        <button
                            onClick={() => {
                                setShowAttachMenu(!showAttachMenu);
                                setShowEmojiPicker(false);
                            }}
                            className={`p-2.5 rounded-xl transition-all ${
                                showAttachMenu
                                    ? 'text-[#3fc5f0] bg-[#242f3d]'
                                    : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
                            }`}
                            title="Attach file, image, or AI copilot"
                        >
                            <Paperclip className="w-5 h-5" />
                        </button>

                        {/* Input box */}
                        <input
                            ref={inputRef}
                            type="text"
                            value={text}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder={
                                editingMessage
                                    ? 'Edit your message...'
                                    : isUploading
                                      ? 'Uploading media...'
                                      : 'Write a message... (type @ai to query bot)'
                            }
                            className="flex-1 px-3 py-2 bg-transparent text-white text-sm placeholder-[#5e6d7d] focus:outline-none"
                        />

                        {/* Action button */}
                        {text.trim() ? (
                            <button
                                onClick={handleSend}
                                className="p-2.5 bg-[#2f88ff] hover:bg-[#2575dc] text-white rounded-xl shadow-md shadow-[#2f88ff]/30 transition-transform active:scale-95 flex-shrink-0"
                                title={editingMessage ? 'Save Edit' : 'Send Message (Enter)'}
                            >
                                {editingMessage ? (
                                    <Check className="w-5 h-5" />
                                ) : (
                                    <Send className="w-5 h-5" />
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={() => setIsVoiceRecording(true)}
                                className="p-2.5 text-[#7f91a4] hover:text-[#3fc5f0] hover:bg-[#242f3d] rounded-xl transition-colors flex-shrink-0"
                                title="Record Voice Note"
                            >
                                <Mic className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
