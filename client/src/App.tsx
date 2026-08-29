import React, { useState, useEffect, useRef } from 'react';
import {
    Heart,
    Shield,
    Sparkles,
    Check,
    Search,
    Compass,
    Radio,
    ShieldAlert,
    Bookmark,
    Settings,
} from 'lucide-react';
import {
    User,
    UserSummary,
    Chat,
    Message,
    ReceiptStatus,
    TransportMode,
    MeshPacket,
} from './types/index';
import { ApiService } from './services/api';
import { wsClient } from './services/ws';
import { sounds } from './services/sound';
import { offlineStorage } from './services/storage';
import { CryptoService } from './services/crypto';
import { meshService } from './services/mesh';
import { GroupE2EEService } from './services/e2eeGroup.service';
import { disappearingService, DisappearingTimer } from './services/disappearing.service';
import { ThemeService } from './services/theme.service';
import { AuthModal } from './components/AuthModal';
import { ChatList } from './components/ChatList';
import { ChatHeader } from './components/ChatHeader';
import { MessageArea } from './components/MessageArea';
import { MessageInput } from './components/MessageInput';
import { NewChatModal } from './components/NewChatModal';
import { CreateGroupModal } from './components/CreateGroupModal';
import { SettingsModal } from './components/SettingsModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { WebRTCManager } from './components/WebRTCManager';
import { AIAssistantBar } from './components/AIAssistantBar';
import { MeshRadarModal } from './components/MeshRadarModal';
import { LoRaBridgeModal } from './components/LoRaBridgeModal';
import { SafetyNumberModal } from './components/SafetyNumberModal';
import { DisappearingTimerModal } from './components/DisappearingTimerModal';
import { MultiDeviceLinkModal } from './components/MultiDeviceLinkModal';
import { AIModerationModal } from './components/AIModerationModal';
import { CallSummaryModal } from './components/CallSummaryModal';
import { CreatePollModal } from './components/CreatePollModal';
import { ThreadModal } from './components/ThreadModal';
import { ChannelAdminDashboardModal } from './components/ChannelAdminDashboardModal';
import { FederationBridgeModal } from './components/FederationBridgeModal';
import { MobileBottomNav } from './components/MobileBottomNav';
import { TwineGlowingLogo } from './components/TwineGlowingLogo';

export function App() {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [demoUsers, setDemoUsers] = useState<UserSummary[]>([]);
    const [chats, setChats] = useState<Chat[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [smartReplies, setSmartReplies] = useState<string[]>([]);
    const [currentTheme, setCurrentTheme] = useState<string>(ThemeService.getActiveTheme().id);
    const [transportMode, setTransportMode] = useState<TransportMode>('CLOUD');
    const [screenshotAlert, setScreenshotAlert] = useState<string | null>(null);
    const [suggestedTopics, setSuggestedTopics] = useState<string[]>([
        '#WebRTC',
        '#Security',
        '#MeshRelay',
    ]);
    const [mobileChatOpen, setMobileChatOpen] = useState<boolean>(false);
    const [mobileTab, setMobileTab] = useState<'chats' | 'calls' | 'mesh' | 'settings'>('chats');

    // Modals
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [showNewChatModal, setShowNewChatModal] = useState(false);
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showGlobalSearchModal, setShowGlobalSearchModal] = useState(false);
    const [showMeshRadarModal, setShowMeshRadarModal] = useState(false);
    const [showLoRaBridgeModal, setShowLoRaBridgeModal] = useState(false);
    const [showSafetyNumberModal, setShowSafetyNumberModal] = useState(false);
    const [showDisappearingModal, setShowDisappearingModal] = useState(false);
    const [showMultiDeviceModal, setShowMultiDeviceModal] = useState(false);
    const [showAIModerationModal, setShowAIModerationModal] = useState(false);
    const [showCreatePollModal, setShowCreatePollModal] = useState(false);
    const [showChannelDashboardModal, setShowChannelDashboardModal] = useState(false);
    const [showFederationModal, setShowFederationModal] = useState(false);
    const [threadParentMessage, setThreadParentMessage] = useState<Message | null>(null);
    const [callSummaryData, setCallSummaryData] = useState<any | null>(null);
    const [currentDisappearingTimer, setCurrentDisappearingTimer] = useState<DisappearingTimer>(0);

    // WebRTC Call State
    const [activeCall, setActiveCall] = useState<{
        peer: UserSummary;
        type: 'voice' | 'video';
        isIncoming?: boolean;
        incomingOffer?: any;
        callId?: string;
    } | null>(null);

    // Real-time states
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
    const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
    const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
    const [mutedChatIds, setMutedChatIds] = useState<Set<string>>(new Set());

    const activeChatRef = useRef<string | null>(null);
    activeChatRef.current = activeChatId;

    const activeCallRef = useRef<any>(null);
    activeCallRef.current = activeCall;

    // Load blocked users
    useEffect(() => {
        if (currentUser) {
            ApiService.getBlockedUsers()
                .then((res) => {
                    setBlockedUserIds(new Set(res.blockedUserIds || []));
                })
                .catch(() => {});
        }
    }, [currentUser]);

    // 1. Initial Load: Check token & load demo users
    useEffect(() => {
        ThemeService.init();
        document.title = 'Twine — Couple & Friends Messenger';

        ApiService.getDemoUsers()
            .then((res) => {
                setDemoUsers(res.users);
                const token = ApiService.getToken();
                if (token) {
                    ApiService.getMe()
                        .then((meRes) => {
                            setCurrentUser(meRes.user);
                            CryptoService.initIdentityKey(meRes.user.id);
                            wsClient.connect();
                        })
                        .catch(async () => {
                            const refreshed = await ApiService.refreshSession();
                            if (refreshed) {
                                try {
                                    const meRes = await ApiService.getMe();
                                    setCurrentUser(meRes.user);
                                    CryptoService.initIdentityKey(meRes.user.id);
                                    wsClient.connect();
                                    return;
                                } catch {}
                            }
                            ApiService.setToken(null, null);
                            setCurrentUser(null);
                            setShowAuthModal(true);
                        });
                } else {
                    setCurrentUser(null);
                    setShowAuthModal(true);
                }
            })
            .catch(async (err) => {
                console.error(err);
                const refreshed = await ApiService.refreshSession();
                if (refreshed) {
                    try {
                        const meRes = await ApiService.getMe();
                        setCurrentUser(meRes.user);
                        CryptoService.initIdentityKey(meRes.user.id);
                        wsClient.connect();
                        return;
                    } catch {}
                }
                setCurrentUser(null);
                setShowAuthModal(true);
            });


        // Network Online / Offline Detection
        const handleOnline = () => {
            setTransportMode('CLOUD');
            wsClient.connect();
            meshService.flushOutbox().then((flushed) => {
                if (flushed > 0) {
                    console.log(`[Store-and-Forward] Flushed ${flushed} queued messages to cloud.`);
                }
            });
        };

        const handleOffline = () => {
            setTransportMode('MESH');
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Mouse ambient spotlight tracker
        const handleMouseMove = (e: MouseEvent) => {
            document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
            document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
        };
        window.addEventListener('mousemove', handleMouseMove);

        // Global Keydown (Escape key closes active modals in priority order)
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showLoRaBridgeModal) {
                    setShowLoRaBridgeModal(false);
                    setShowMeshRadarModal(true);
                } else if (showMultiDeviceModal) {
                    setShowMultiDeviceModal(false);
                    setShowSettingsModal(true);
                } else if (threadParentMessage) {
                    setThreadParentMessage(null);
                } else if (callSummaryData) {
                    setCallSummaryData(null);
                } else if (showAIModerationModal) {
                    setShowAIModerationModal(false);
                } else if (showCreatePollModal) {
                    setShowCreatePollModal(false);
                } else if (showChannelDashboardModal) {
                    setShowChannelDashboardModal(false);
                } else if (showFederationModal) {
                    setShowFederationModal(false);
                } else if (showSafetyNumberModal) {
                    setShowSafetyNumberModal(false);
                } else if (showDisappearingModal) {
                    setShowDisappearingModal(false);
                } else if (showMeshRadarModal) {
                    setShowMeshRadarModal(false);
                } else if (showGlobalSearchModal) {
                    setShowGlobalSearchModal(false);
                } else if (showSettingsModal) {
                    setShowSettingsModal(false);
                } else if (showCreateGroupModal) {
                    setShowCreateGroupModal(false);
                } else if (showNewChatModal) {
                    setShowNewChatModal(false);
                } else if (showAuthModal && currentUser) {
                    setShowAuthModal(false);
                }
            }

            if (e.key === 'PrintScreen') {
                triggerScreenshotWarning();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        // Listen to mesh packets
        const unsubMesh = meshService.onPacket(async (packet: MeshPacket) => {
            const plaintext = await CryptoService.decrypt(packet.payload_ciphertext, packet.nonce);
            const meshMsg: Message = {
                id: packet.packet_id,
                chat_id: packet.chat_id,
                sender_id: packet.sender_pubkey,
                content_text: plaintext,
                type: 'TEXT',
                is_edited: false,
                is_deleted: false,
                created_at: new Date(packet.timestamp).toISOString(),
                status: 'DELIVERED',
                transport_mode: 'MESH',
                hop_count: packet.hop_count,
                sender: {
                    id: packet.sender_pubkey,
                    username: packet.sender_name.toLowerCase().replace(/\s+/g, '_'),
                    display_name: packet.sender_name,
                },
            };

            await offlineStorage.saveMessageLocally(meshMsg);

            if (activeChatRef.current === packet.chat_id) {
                setMessages((prev) => [...prev, meshMsg]);
            }
            sounds.playReceived();
        });

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('keydown', handleKeyDown);
            unsubMesh();
        };
    }, [
        showLoRaBridgeModal,
        showMultiDeviceModal,
        threadParentMessage,
        callSummaryData,
        showAIModerationModal,
        showCreatePollModal,
        showChannelDashboardModal,
        showFederationModal,
        showSafetyNumberModal,
        showDisappearingModal,
        showMeshRadarModal,
        showGlobalSearchModal,
        showSettingsModal,
        showCreateGroupModal,
        showNewChatModal,
    ]);

    const triggerScreenshotWarning = () => {
        setScreenshotAlert(
            '⚠️ Screenshot / Screen recording attempt detected in confidential chat.'
        );
        sounds.playReceived();
        setTimeout(() => setScreenshotAlert(null), 4500);
    };

    // 2. Fetch chats when currentUser changes
    useEffect(() => {
        if (!currentUser) return;
        refreshChats();
    }, [currentUser]);

    const refreshChats = async () => {
        try {
            const res = await ApiService.getChats();
            setChats(res.chats);
            if (!activeChatRef.current && res.chats.length > 0) {
                setActiveChatId(res.chats[0].id);
            }
        } catch (err) {
            console.error('Failed to load chats:', err);
        }
    };

    // 3. Load messages and smart replies when active chat changes
    useEffect(() => {
        if (!activeChatId || !currentUser) {
            setMessages([]);
            setSmartReplies([]);
            return;
        }

        // Load disappearing timer for chat
        const timerVal = disappearingService.getChatTimer(activeChatId);
        setCurrentDisappearingTimer(timerVal);

        // Fetch AI-suggested group topics
        ApiService.suggestGroupTopics(activeChatId).then((res) => {
            if (res.suggestedTopics && res.suggestedTopics.length > 0) {
                setSuggestedTopics(res.suggestedTopics);
            }
        });

        // Load local cached messages first for instant response
        offlineStorage.getLocalMessages(activeChatId).then((localMsgs) => {
            if (localMsgs.length > 0) {
                // Only use cached messages if the network request has
                // not already populated the chat.
                setMessages((prev) => (prev.length === 0 ? localMsgs : prev));
            }
        });

        ApiService.getMessages(activeChatId)
            .then(async (res) => {
                // Start with the server's current messages and preserve pending queued messages
                let loadedMessages = res.messages;

                // Mark all incoming messages as read.
                try {
                    const readRes = await ApiService.markChatRead(activeChatId);

                    if (readRes.count > 0) {
                        const readIds = new Set(readRes.readMessageIds);

                        // Apply READ state directly to the freshly loaded messages.
                        loadedMessages = loadedMessages.map((message) =>
                            readIds.has(message.id) ? { ...message, status: 'READ' } : message
                        );

                        setChats((prev) =>
                            prev.map((c) => (c.id === activeChatId ? { ...c, unread_count: 0 } : c))
                        );

                        // Tell the WebSocket server so the original sender
                        // receives the real-time READ receipt.
                        for (const msgId of readRes.readMessageIds) {
                            wsClient.send('chat:read_receipt', {
                                chat_id: activeChatId,
                                message_id: msgId,
                            });
                        }
                    }
                } catch (readErr) {
                    console.warn('Failed to mark chat as read:', readErr);
                }

                // Preserve local QUEUED or pending optimistic messages that haven't landed yet
                setMessages((prev) => {
                    const pending = prev.filter((m) => m.id.startsWith('temp_') || m.status === 'QUEUED');
                    const loadedIds = new Set(loadedMessages.map((m) => m.id));
                    const pendingNotLoaded = pending.filter((m) => !loadedIds.has(m.id));
                    return [...loadedMessages, ...pendingNotLoaded];
                });

                // Persist the final state locally.
                offlineStorage.saveMessagesLocally(loadedMessages);

                // Fetch AI smart replies.
                ApiService.getSmartReplies(activeChatId).then((replyRes) => {
                    setSmartReplies(replyRes.replies || []);
                });
            })
            .catch((err) => {
                console.warn('Network offline or fetch error, using local messages:', err);
                setTransportMode('MESH');
            });
    }, [activeChatId, currentUser]);

    // 4. Setup WebSocket Event Subscriptions
    useEffect(() => {
        if (!currentUser) return;

        // A. Receive new message (with deduplication)
        const unsubNewMsg = wsClient.on(
            'chat:new_message',
            (payload: { message: Message; chat_id: string }) => {
                const { message, chat_id } = payload;
                sounds.playReceived();
                offlineStorage.saveMessageLocally(message);

                if (activeChatRef.current === chat_id) {
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === message.id)) return prev;
                        return [...prev, message];
                    });

                    wsClient.send('chat:read_receipt', {
                        chat_id,
                        message_id: message.id,
                    });

                    // Update smart replies
                    ApiService.getSmartReplies(chat_id).then((replyRes) => {
                        setSmartReplies(replyRes.replies || []);
                    });

                    // Schedule Disappearing Message Self-Destruct if timer is active
                    const timerSeconds = disappearingService.getChatTimer(chat_id);
                    if (timerSeconds > 0) {
                        setTimeout(() => {
                            setMessages((prev) => prev.filter((m) => m.id !== message.id));
                        }, timerSeconds * 1000);
                    }
                }

                setChats((prev) => {
                    const existingIdx = prev.findIndex((c) => c.id === chat_id);
                    if (existingIdx === -1) {
                        refreshChats();
                        return prev;
                    }
                    const updated = [...prev];
                    const chat = updated[existingIdx];
                    const isCurrentActive = activeChatRef.current === chat_id;

                    updated[existingIdx] = {
                        ...chat,
                        last_message: message,
                        updated_at: message.created_at,
                        unread_count: isCurrentActive ? 0 : (chat.unread_count || 0) + 1,
                    };
                    return updated.sort(
                        (a, b) =>
                            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                    );
                });
            }
        );

        // B. Message Sent ACK
        const unsubMsgAck = wsClient.on('chat:message_ack', (payload) => {
            setMessages((prev) =>
                prev.map((m) =>
                    m.id === payload.temp_id
                        ? {
                              ...m,
                              id: payload.message_id,
                              status: 'SENT',
                              isSending: false,
                              created_at: payload.created_at,
                          }
                        : m
                )
            );
            offlineStorage.removeFromOutbox(payload.temp_id);
        });

        // C. Message Edited
        const unsubMsgEdited = wsClient.on(
            'chat:message_edited',
            (payload: { message: Message; chat_id: string }) => {
                setMessages((prev) =>
                    prev.map((m) => (m.id === payload.message.id ? payload.message : m))
                );
                offlineStorage.saveMessageLocally(payload.message);
            }
        );

        // D. Message Deleted
        const unsubMsgDeleted = wsClient.on(
            'chat:message_deleted',
            (payload: { message_id: string; chat_id: string }) => {
                setMessages((prev) => prev.filter((m) => m.id !== payload.message_id));
            }
        );

        // E. Reaction Updated
        const unsubReaction = wsClient.on(
            'chat:reaction_updated',
            (payload: {
                message_id: string;
                chat_id: string;
                reactions: Record<string, string[]>;
            }) => {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === payload.message_id ? { ...m, reactions: payload.reactions } : m
                    )
                );
            }
        );

        // F. Pinned Message
        const unsubPin = wsClient.on(
            'chat:message_pinned',
            (payload: { chat_id: string; pinned_message: Message | null }) => {
                setChats((prev) =>
                    prev.map((c) =>
                        c.id === payload.chat_id
                            ? { ...c, pinned_message: payload.pinned_message || undefined }
                            : c
                    )
                );
            }
        );

        // G. Typing indicator
        const unsubTyping = wsClient.on('chat:user_typing', (payload) => {
            const { chat_id, display_name, is_typing } = payload;
            setTypingUsers((prev) => {
                const next = new Map(prev);
                if (is_typing) next.set(chat_id, display_name);
                else next.delete(chat_id);
                return next;
            });
        });

        // H. Receipt updates
        const unsubReceipt = wsClient.on(
            'chat:receipt_update',
            (payload: { message_id: string; status: ReceiptStatus; chat_id?: string }) => {
                const { message_id, status, chat_id } = payload;

                // Ignore receipt events for another chat.
                if (chat_id && activeChatRef.current !== chat_id) {
                    return;
                }

                // Update the visible message immediately.
                setMessages((prev) => {
                    let changed = false;

                    const next = prev.map((message) => {
                        if (message.id !== message_id) {
                            return message;
                        }

                        // Never downgrade a READ message.
                        if (message.status === 'READ' && status !== 'READ') {
                            return message;
                        }

                        // READ is the highest receipt state.
                        if (message.status === 'DELIVERED' && status === 'SENT') {
                            return message;
                        }

                        changed = true;

                        return {
                            ...message,
                            status,
                        };
                    });

                    return changed ? next : prev;
                });

                // Keep the chat-list preview synchronized too.
                setChats((prev) =>
                    prev.map((chat) => {
                        if (chat.last_message?.id !== message_id) {
                            return chat;
                        }

                        const currentStatus = chat.last_message.status;

                        // Never downgrade READ -> DELIVERED/SENT.
                        if (currentStatus === 'READ' && status !== 'READ') {
                            return chat;
                        }

                        return {
                            ...chat,
                            last_message: {
                                ...chat.last_message,
                                status,
                            },
                        };
                    })
                );
            }
        );

        // I. Peer Presence updates
        const unsubPresence = wsClient.on('presence:update', (payload) => {
            const { user_id, is_online } = payload;
            setOnlineUserIds((prev) => {
                const next = new Set(prev);
                if (is_online) next.add(user_id);
                else next.delete(user_id);
                return next;
            });
        });

        // J. WebRTC Incoming Call
        const unsubCall = wsClient.on('webrtc:incoming_call', (payload) => {
            console.log('📞 Received incoming WebRTC call from:', payload.caller?.display_name, payload);
            if (activeCallRef.current) {
                // If this is a duplicate delivery for the same call or same caller, ignore safely without hanging up
                if (activeCallRef.current.callId === payload.call_id || activeCallRef.current.peer?.id === payload.caller_id) {
                    console.log('[WebRTC] Duplicate/redundant incoming_call event received for active call with peer:', payload.caller_id);
                    return;
                }
                console.warn('[WebRTC] User is currently on another call with a different peer. Replying with busy.');
                wsClient.send('webrtc:hangup', {
                    call_id: payload.call_id,
                    target_user_id: payload.caller_id,
                    reason: 'busy',
                });
                return;
            }
            // Clear any stale previous call summary
            setCallSummaryData(null);
            const callObj = {
                peer: payload.caller,
                type: payload.call_type,
                isIncoming: true,
                incomingOffer: payload.offer,
                callId: payload.call_id,
            };
            activeCallRef.current = callObj;
            setActiveCall(callObj);
        });

        // J2. WebRTC Call Ended (Global Fallback Cleanup)
        const unsubCallEnded = wsClient.on('webrtc:call_ended', (payload) => {
            console.log('📴 [App] WebRTC call ended event received:', payload);
            if (activeCallRef.current && (!payload?.call_id || payload.call_id === activeCallRef.current.callId)) {
                activeCallRef.current = null;
                setActiveCall(null);
            }
        });

        // K. Auth Ack
        const unsubAuthAck = () => {
            setTransportMode('CLOUD');
            refreshChats();
            meshService.flushOutbox();
        };
        const unsubAuth = wsClient.on('auth:ack', unsubAuthAck);

        return () => {
            unsubNewMsg();
            unsubMsgAck();
            unsubMsgEdited();
            unsubMsgDeleted();
            unsubReaction();
            unsubPin();
            unsubTyping();
            unsubReceipt();
            unsubPresence();
            unsubCall();
            unsubCallEnded();
            unsubAuth();
        };
    }, [currentUser]);

    // Actions
    const handleSendMessage = async (
        content: string,
        replyToId?: string,
        mediaUrl?: string,
        mediaType: any = 'TEXT',
        mediaMetadata?: any
    ) => {
        if (!activeChatId || !currentUser) return;

        // AI Moderation check for sensitive text (safely wrapped)
        if (content) {
            try {
                const mod = await ApiService.moderateContent(content);
                if (mod && mod.flagged && mod.action === 'DELETE') {
                    alert(`❌ Message blocked by AI Moderation: ${mod.reason}`);
                    return;
                }
            } catch (e) {
                console.warn('AI moderation check skipped (offline/error):', e);
            }
        }

        const isConnected = wsClient.getIsConnected() && navigator.onLine;
        const tempId = `temp_${Date.now()}`;
        const optimisticMessage: Message = {
            id: tempId,
            chat_id: activeChatId,
            sender_id: currentUser.id,
            reply_to_message_id: replyToId,
            reply_to: replyToMessage
                ? {
                      id: replyToMessage.id,
                      sender_id: replyToMessage.sender_id,
                      sender_name: replyToMessage.sender?.display_name || 'User',
                      content_text: replyToMessage.content_text,
                      type: replyToMessage.type,
                  }
                : undefined,
            type: mediaType,
            content_text: content,
            media_url: mediaUrl,
            media_metadata: mediaMetadata,
            is_edited: false,
            is_deleted: false,
            created_at: new Date().toISOString(),
            status: isConnected ? 'SENT' : 'QUEUED',
            isSending: isConnected,
            transport_mode: isConnected ? 'CLOUD' : 'MESH',
            hop_count: isConnected ? 0 : 1,
            sender: {
                id: currentUser.id,
                username: currentUser.username,
                display_name: currentUser.display_name,
                avatar_url: currentUser.avatar_url,
            },
        };

        // 1. Immediately persist to local IndexedDB
        await offlineStorage.saveMessageLocally(optimisticMessage);
        setMessages((prev) => [...prev, optimisticMessage]);
        sounds.playSent();

        // Schedule local Disappearing Message self-destruct if active
        if (currentDisappearingTimer > 0) {
            setTimeout(() => {
                setMessages((prev) => prev.filter((m) => m.id !== tempId));
            }, currentDisappearingTimer * 1000);
        }

        if (isConnected) {
            // 2a. Send to Cloud WebSocket
            wsClient.send('chat:send_message', {
                temp_id: tempId,
                chat_id: activeChatId,
                content,
                type: mediaType,
                reply_to_id: replyToId,
                media_url: mediaUrl,
                media_metadata: mediaMetadata,
            });

            // 10s ACK timeout: mark as failed if no ack received
            setTimeout(() => {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === tempId && m.isSending
                            ? { ...m, isSending: false, status: 'FAILED' }
                            : m
                    )
                );
            }, 10000);
        } else {
            // 2b. Queue in offline outbox + broadcast via BLE / LoRa Mesh
            await offlineStorage.enqueueOutbox({
                id: tempId,
                chat_id: activeChatId,
                content,
                type: mediaType,
                reply_to_id: replyToId,
                media_url: mediaUrl,
                media_metadata: mediaMetadata,
                created_at: optimisticMessage.created_at,
            });

            // Relay via P2P Mesh
            meshService.broadcastMessage(activeChatId, content, currentUser.display_name);
        }

        setChats((prev) =>
            prev.map((c) =>
                c.id === activeChatId
                    ? {
                          ...c,
                          last_message: optimisticMessage,
                          updated_at: optimisticMessage.created_at,
                      }
                    : c
            )
        );
    };

    const handleEditSubmit = (messageId: string, newText: string) => {
        if (!activeChatId) return;
        wsClient.send('chat:edit_message', {
            message_id: messageId,
            chat_id: activeChatId,
            content_text: newText,
        });
        setMessages((prev) =>
            prev.map((m) =>
                m.id === messageId ? { ...m, content_text: newText, is_edited: true } : m
            )
        );
    };

    const handleDeleteMessage = (messageId: string) => {
        if (!activeChatId) return;
        wsClient.send('chat:delete_message', {
            message_id: messageId,
            chat_id: activeChatId,
        });
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };

    const handleReact = (messageId: string, emoji: string) => {
        if (!activeChatId) return;
        wsClient.send('chat:react', {
            message_id: messageId,
            chat_id: activeChatId,
            emoji,
        });
    };

    const handlePin = (messageId: string, isPinned: boolean) => {
        if (!activeChatId) return;
        wsClient.send('chat:pin_message', {
            message_id: messageId,
            chat_id: activeChatId,
            is_pinned: isPinned,
        });
    };

    const handleTyping = (isTyping: boolean) => {
        if (!activeChatId) return;
        wsClient.send('chat:typing', {
            chat_id: activeChatId,
            is_typing: isTyping,
        });
    };

    const handleFastSwitchUser = async (userId: string) => {
        wsClient.disconnect();
        setMessages([]);
        setChats([]);
        setActiveChatId(null);
        try {
            await offlineStorage.clearUserData();
        } catch (e) {
            console.error('Failed to clear offline storage on switch', e);
        }
        const res = await ApiService.demoLogin(userId);
        setCurrentUser(res.user);
        CryptoService.initIdentityKey(res.user.id);
        wsClient.connect();
    };

    const handleLogout = async () => {
        wsClient.disconnect();
        ApiService.setToken(null);
        setCurrentUser(null);
        setActiveChatId(null);
        setMessages([]);
        setChats([]);
        try {
            await offlineStorage.clearUserData();
        } catch (e) {
            console.error('Failed to clear offline storage on logout', e);
        }
        setShowAuthModal(true);
    };

    const handleToggleBlock = async (targetUserId: string) => {
        const isCurrentlyBlocked = blockedUserIds.has(targetUserId);
        try {
            if (isCurrentlyBlocked) {
                await ApiService.unblockUser(targetUserId);
                setBlockedUserIds((prev) => {
                    const next = new Set(prev);
                    next.delete(targetUserId);
                    return next;
                });
                alert('✅ Contact unblocked successfully.');
            } else {
                await ApiService.blockUser(targetUserId);
                setBlockedUserIds((prev) => {
                    const next = new Set(prev);
                    next.add(targetUserId);
                    return next;
                });
                alert('🚫 Contact blocked. They will not be able to message or call you.');
            }
        } catch (err: any) {
            alert(err.message || 'Failed to update block status');
        }
    };

    const handleToggleMute = (chatId: string) => {
        setMutedChatIds((prev) => {
            const next = new Set(prev);
            if (next.has(chatId)) {
                next.delete(chatId);
                alert('🔔 Notifications unmuted for this chat.');
            } else {
                next.add(chatId);
                alert('🔕 Notifications muted for this chat.');
            }
            return next;
        });
    };

    const handleClearChat = (chatId: string) => {
        if (window.confirm('Are you sure you want to clear message history for this conversation?')) {
            setMessages([]);
            offlineStorage.saveMessagesLocally([]);
            alert('🧹 Conversation history cleared.');
        }
    };

    const handleEndCall = async (callDuration = 0) => {
        if (activeCall) {
            const peerName = activeCall.peer.display_name;
            activeCallRef.current = null;
            setActiveCall(null);
            if (callDuration >= 15) {
                try {
                    // Only request AI summary for calls lasting 15+ seconds
                    const summary = await ApiService.getCallSummary(callDuration, peerName);
                    if (summary) {
                        setCallSummaryData(summary);
                    }
                } catch {
                    // Ignore
                }
            } else {
                setCallSummaryData(null);
            }
        } else {
            activeCallRef.current = null;
            setCallSummaryData(null);
        }
    };


    const activeChat = chats.find((c) => c.id === activeChatId);

    return (
        <div className="flex flex-col h-screen h-[100dvh] w-screen w-[100dvw] text-theme-primary bg-theme-primary overflow-hidden relative selection:bg-[#2f88ff]/30">
            {/* GPU-Accelerated Static Ambient Background */}
            <div className="ambient-glow-mesh" />

            {/* Screenshot Warning Banner */}
            {screenshotAlert && (
                <div className="sticky top-0 z-50 bg-gradient-to-r from-red-600 to-amber-600 px-4 py-2 flex items-center justify-between text-xs font-semibold shadow-xl animate-bounce">
                    <div className="flex items-center space-x-2">
                        <ShieldAlert className="w-4 h-4 text-white" />
                        <span>{screenshotAlert}</span>
                    </div>
                    <button
                        onClick={() => setScreenshotAlert(null)}
                        className="text-white/80 hover:text-white"
                    >
                        Dismiss
                    </button>
                </div>
            )}
            {/* Clean Twine App Header */}
            <header className="h-12 bg-theme-sidebar border-b border-theme px-3 sm:px-4 flex items-center justify-between text-xs select-none flex-shrink-0 sticky top-0 z-30 min-w-0">
                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1 mr-2">
                    <TwineGlowingLogo size="sm" />
                    <div className="flex items-center space-x-1 sm:space-x-1.5 min-w-0">
                        <span className="font-extrabold text-sm tracking-tight bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] bg-clip-text text-transparent truncate">
                            Twine
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-[#ff007f]/15 text-[#ff758c] rounded-full font-mono font-medium hidden sm:inline flex-shrink-0">
                            Couples & Friends
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/30 flex-shrink-0">
                            v3.0.4 • CLEAN-UI-NO-BANNERS
                        </span>
                    </div>

                    <div className="h-4 w-px bg-white/10 mx-1 hidden md:block" />

                    <div className="flex items-center space-x-1.5 min-w-0">
                        <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                transportMode === 'CLOUD'
                                    ? 'bg-emerald-400 animate-pulse'
                                    : transportMode === 'MESH'
                                      ? 'bg-purple-400 animate-pulse'
                                      : 'bg-amber-400'
                            }`}
                        />
                        <span className="text-[11px] text-theme-secondary font-medium hidden md:inline">
                            {transportMode === 'CLOUD' ? 'Cloud Connected' : 'Mesh Mode Active'}
                        </span>
                        {currentUser && (
                            <span className="text-xs font-semibold text-theme-primary truncate max-w-[110px] sm:max-w-[140px] hidden xs:inline">
                                • {currentUser.display_name}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
                    <button
                        onClick={() => setShowMeshRadarModal(true)}
                        className="px-2.5 py-1 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-semibold flex items-center space-x-1.5 transition-all"
                        title="Open Couple P2P Mesh Radar"
                    >
                        <Compass className="w-3.5 h-3.5 text-purple-400" />
                        <span className="hidden sm:inline">Mesh Radar</span>
                    </button>

                    <button
                        onClick={() => setShowFederationModal(true)}
                        className="px-2.5 py-1 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center space-x-1.5 transition-all"
                        title="Matrix / XMPP Bridge"
                    >
                        <Radio className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="hidden sm:inline">Bridge</span>
                    </button>

                    <button
                        onClick={() => setShowSettingsModal(true)}
                        className="p-1.5 rounded-xl text-theme-secondary hover:text-theme-primary hover:bg-theme-hover transition-all"
                        title="Settings & Themes"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </header>

            {/* Main Layout */}
            <div className="flex flex-1 overflow-hidden relative z-10 min-h-0">
                {currentUser ? (
                    <>
                        <div
                            className={`w-full md:w-80 lg:w-96 xl:w-[380px] flex-shrink-0 h-full flex flex-col min-h-0 ${mobileChatOpen ? 'hidden md:flex' : 'flex'}`}
                        >
                            <ChatList
                                currentUser={currentUser}
                                chats={chats}
                                activeChatId={activeChatId}
                                onSelectChat={(id) => {
                                    setActiveChatId(id);
                                    setMobileChatOpen(true);
                                }}
                                onNewChat={() => setShowNewChatModal(true)}
                                onNewGroup={() => setShowCreateGroupModal(true)}
                                onOpenSettings={() => setShowSettingsModal(true)}
                                onOpenSearch={() => setShowGlobalSearchModal(true)}
                                onSwitchAccount={() => setShowAuthModal(true)}
                                onLogout={handleLogout}
                                onlineUserIds={onlineUserIds}
                                typingUsers={typingUsers}
                            />
                        </div>

                        {activeChat ? (
                            <main
                                className={`flex-1 flex flex-col h-full min-h-0 min-w-0 bg-theme-primary relative ${!mobileChatOpen ? 'hidden md:flex' : 'flex'}`}
                            >
                                <ChatHeader
                                    chat={activeChat}
                                    isOnline={
                                        activeChat.peer_user
                                            ? onlineUserIds.has(activeChat.peer_user.id)
                                            : false
                                    }
                                    isTyping={typingUsers.has(activeChat.id)}
                                    isBlocked={
                                        Boolean(activeChat.peer_user && blockedUserIds.has(activeChat.peer_user.id))
                                    }
                                    isMuted={mutedChatIds.has(activeChat.id)}
                                    transportMode={transportMode}
                                    meshPeerCount={meshService.getPeers().length}
                                    disappearingTimer={currentDisappearingTimer}
                                    suggestedTopics={suggestedTopics}
                                    onBackMobile={() => setMobileChatOpen(false)}
                                    onOpenSearch={() => setShowGlobalSearchModal(true)}
                                    onOpenMeshRadar={() => setShowMeshRadarModal(true)}
                                    onOpenSafetyNumber={() => setShowSafetyNumberModal(true)}
                                    onOpenDisappearingTimer={() => setShowDisappearingModal(true)}
                                    onOpenAIModeration={() => setShowAIModerationModal(true)}
                                    onOpenCreatePoll={() => setShowCreatePollModal(true)}
                                    onOpenChannelDashboard={() =>
                                        setShowChannelDashboardModal(true)
                                    }
                                    onOpenFederationBridge={() => setShowFederationModal(true)}
                                    onToggleBlock={() => {
                                        if (activeChat.peer_user) {
                                            handleToggleBlock(activeChat.peer_user.id);
                                        }
                                    }}
                                    onToggleMute={() => handleToggleMute(activeChat.id)}
                                    onClearChat={() => handleClearChat(activeChat.id)}
                                    onStartCall={(type) => {
                                        if (activeChat.peer_user) {
                                            if (blockedUserIds.has(activeChat.peer_user.id)) {
                                                alert('❌ Cannot start call with a blocked contact.');
                                                return;
                                            }
                                            setCallSummaryData(null);
                                            const newCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                                            const callObj = {
                                                peer: activeChat.peer_user,
                                                type,
                                                callId: newCallId,
                                                isIncoming: false,
                                            };
                                            activeCallRef.current = callObj;
                                            setActiveCall(callObj);
                                        }
                                    }}
                                />

                                <MessageArea
                                    messages={messages}
                                    currentUser={currentUser}
                                    pinnedMessage={activeChat.pinned_message}
                                    onReply={(msg) => setReplyToMessage(msg)}
                                    onEdit={(msg) => setEditingMessage(msg)}
                                    onDelete={handleDeleteMessage}
                                    onReact={handleReact}
                                    onPin={handlePin}
                                    onOpenThread={(msg) => setThreadParentMessage(msg)}
                                />

                                {/* AI Assistant Smart Replies & Summarize Bar */}
                                <AIAssistantBar
                                    chatId={activeChat.id}
                                    smartReplies={smartReplies}
                                    onSelectReply={(replyText) => handleSendMessage(replyText)}
                                />

                                {activeChat.peer_user && blockedUserIds.has(activeChat.peer_user.id) ? (
                                    <div className="p-4 bg-[#17212b] border-t border-theme flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-red-300 select-none">
                                        <div className="flex items-center space-x-2">
                                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0"></span>
                                            <span>You have blocked this contact. Unblock to send messages or start calls.</span>
                                        </div>
                                        <button
                                            onClick={() => activeChat.peer_user && handleToggleBlock(activeChat.peer_user.id)}
                                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow transition-all flex-shrink-0"
                                        >
                                            Unblock Contact
                                        </button>
                                    </div>
                                ) : (
                                    <MessageInput
                                        chatId={activeChat.id}
                                        replyToMessage={replyToMessage}
                                        editingMessage={editingMessage}
                                        onClearReply={() => setReplyToMessage(null)}
                                        onClearEdit={() => setEditingMessage(null)}
                                        onSendMessage={handleSendMessage}
                                        onEditSubmit={handleEditSubmit}
                                        onTyping={handleTyping}
                                    />
                                )}
                            </main>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-theme-primary">
                                <div className="mb-6 flex justify-center">
                                    <TwineGlowingLogo size="xl" />
                                </div>
                                <h3 className="text-2xl font-black text-theme-primary mb-2 bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] bg-clip-text text-transparent">
                                    Welcome to Twine
                                </h3>
                                <p className="text-sm text-theme-secondary max-w-md mb-6 leading-relaxed">
                                    Private real-time messenger built exclusively for couples and
                                    close friends with E2EE, WebRTC audio/video calls, and offline
                                    mesh resilience.
                                </p>
                                <div className="flex space-x-3">
                                    <button
                                        onClick={() => setShowNewChatModal(true)}
                                        className="px-5 py-2.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#2f88ff]/25 hover:opacity-95 transition-all"
                                    >
                                        Start 1:1 Chat
                                    </button>
                                    <button
                                        onClick={() => setShowCreateGroupModal(true)}
                                        className="px-5 py-2.5 bg-theme-sidebar text-theme-primary font-semibold text-sm rounded-xl border border-theme hover:bg-theme-hover transition-all"
                                    >
                                        Create Group / Channel
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-theme-primary">
                        <div className="mb-6 flex justify-center animate-pulse">
                            <TwineGlowingLogo size="xl" />
                        </div>
                        <h3 className="text-2xl font-black text-white mb-2 bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] bg-clip-text text-transparent">
                            Twine Messenger
                        </h3>
                        <p className="text-xs text-[#7f91a4] mb-6">
                            Private real-time messenger. Please sign in to access your conversations.
                        </p>
                        <button
                            onClick={() => setShowAuthModal(true)}
                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-[#ff007f] to-[#b829ea] text-white text-xs font-bold shadow-lg shadow-[#ff007f]/30 hover:opacity-95"
                        >
                            Sign In / Select Account
                        </button>
                    </div>
                )}
            </div>


            {/* Telegram-Style Mobile Bottom Navigation Bar */}
            {currentUser && !mobileChatOpen && (
                <MobileBottomNav
                    activeTab={mobileTab}
                    unreadCount={chats.reduce((acc, c) => acc + (c.unread_count || 0), 0)}
                    onSelectTab={(tab) => setMobileTab(tab)}
                    onOpenMeshRadar={() => setShowMeshRadarModal(true)}
                    onOpenSettings={() => setShowSettingsModal(true)}
                />
            )}

            {/* Modals */}
            {showAuthModal && (
                <AuthModal
                    onSuccess={(user) => {
                        setCurrentUser(user);
                        setShowAuthModal(false);
                        CryptoService.initIdentityKey(user.id);
                        wsClient.connect();

                        // Automatically trigger native push notification permission request ONE TIME after successful new login
                        if ('Notification' in window && Notification.permission === 'default') {
                            setTimeout(() => {
                                Notification.requestPermission()
                                    .then(async (perm) => {
                                        if (perm === 'granted') {
                                            try {
                                                await ApiService.subscribePush({
                                                    endpoint: 'https://fcm.googleapis.com/fcm/send/twine_web_push',
                                                    keys: {
                                                        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9Ac',
                                                        auth: 'tBHItJI5svbpez7KI4CCXg',
                                                    },
                                                });
                                            } catch (pushErr) {
                                                console.warn('[Push] Background registration notice:', pushErr);
                                            }
                                        }
                                    })
                                    .catch(() => {});
                            }, 500);
                        }
                    }}
                    onClose={currentUser ? () => setShowAuthModal(false) : undefined}
                />
            )}

            {showNewChatModal && (
                <NewChatModal
                    onClose={() => setShowNewChatModal(false)}
                    onSelectUser={async (targetUserId) => {
                        const res = await ApiService.createDirectChat(targetUserId);
                        refreshChats();
                        setActiveChatId(res.chat.id);
                        setMobileChatOpen(true);
                    }}
                />
            )}

            {showCreateGroupModal && (
                <CreateGroupModal
                    onClose={() => setShowCreateGroupModal(false)}
                    onCreated={(groupChat) => {
                        refreshChats();
                        setActiveChatId(groupChat.id);
                        setMobileChatOpen(true);
                    }}
                />
            )}

            {showSettingsModal && currentUser && (
                <SettingsModal
                    currentUser={currentUser}
                    currentTheme={currentTheme}
                    onThemeChange={(theme) => setCurrentTheme(theme)}
                    onClose={() => setShowSettingsModal(false)}
                    onProfileUpdated={(updated) => setCurrentUser(updated)}
                    onOpenLinkDevice={() => {
                        setShowSettingsModal(false);
                        setShowMultiDeviceModal(true);
                    }}
                />
            )}

            {showGlobalSearchModal && (
                <GlobalSearchModal
                    onClose={() => setShowGlobalSearchModal(false)}
                    onSelectResult={(chatId) => {
                        setActiveChatId(chatId);
                        setMobileChatOpen(true);
                    }}
                />
            )}

            {showMeshRadarModal && (
                <MeshRadarModal
                    onClose={() => setShowMeshRadarModal(false)}
                    onOpenLoRa={() => {
                        setShowMeshRadarModal(false);
                        setShowLoRaBridgeModal(true);
                    }}
                />
            )}

            {showLoRaBridgeModal && (
                <LoRaBridgeModal
                    onClose={() => setShowLoRaBridgeModal(false)}
                    onBack={() => {
                        setShowLoRaBridgeModal(false);
                        setShowMeshRadarModal(true);
                    }}
                />
            )}

            {showSafetyNumberModal && activeChat?.peer_user && (
                <SafetyNumberModal
                    peer={activeChat.peer_user}
                    onClose={() => setShowSafetyNumberModal(false)}
                />
            )}

            {showDisappearingModal && activeChat && (
                <DisappearingTimerModal
                    chatId={activeChat.id}
                    onClose={() => setShowDisappearingModal(false)}
                    onTimerChanged={(newTimer) => setCurrentDisappearingTimer(newTimer)}
                />
            )}

            {showMultiDeviceModal && (
                <MultiDeviceLinkModal
                    onClose={() => setShowMultiDeviceModal(false)}
                    onBack={() => {
                        setShowMultiDeviceModal(false);
                        setShowSettingsModal(true);
                    }}
                />
            )}

            {showAIModerationModal && activeChat && (
                <AIModerationModal
                    chatTitle={activeChat.title || 'Group'}
                    onClose={() => setShowAIModerationModal(false)}
                />
            )}

            {showCreatePollModal && activeChat && (
                <CreatePollModal
                    chatId={activeChat.id}
                    onClose={() => setShowCreatePollModal(false)}
                    onPollCreated={(pollMsg) => {
                        setMessages((prev) => [...prev, pollMsg]);
                        offlineStorage.saveMessageLocally(pollMsg);
                    }}
                />
            )}

            {showChannelDashboardModal && activeChat && (
                <ChannelAdminDashboardModal
                    chatId={activeChat.id}
                    channelTitle={activeChat.title || 'Channel'}
                    onClose={() => setShowChannelDashboardModal(false)}
                />
            )}

            {showFederationModal && (
                <FederationBridgeModal onClose={() => setShowFederationModal(false)} />
            )}

            {threadParentMessage && currentUser && (
                <ThreadModal
                    parentMessage={threadParentMessage}
                    currentUser={currentUser}
                    onClose={() => setThreadParentMessage(null)}
                    onSendReply={(replyText, parentId) => handleSendMessage(replyText, parentId)}
                />
            )}

            {callSummaryData && !activeCall && (
                <CallSummaryModal
                    summaryData={callSummaryData}
                    onClose={() => setCallSummaryData(null)}
                />
            )}

            {activeCall && (
                <WebRTCManager
                    peer={activeCall.peer}
                    callType={activeCall.type}
                    isIncoming={activeCall.isIncoming}
                    incomingOffer={activeCall.incomingOffer}
                    callId={activeCall.callId}
                    currentUserId={currentUser?.id}
                    onEndCall={handleEndCall}
                />
            )}
        </div>
    );
}
