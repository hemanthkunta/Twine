import { useEffect, useRef } from 'react';
import { Chat, Message, ReceiptStatus, TransportMode, UserSummary } from '../types/index';
import { wsClient } from '../services/ws';
import { sounds } from '../services/sound';
import { offlineStorage } from '../services/storage';
import { meshService } from '../services/mesh';
import { disappearingService } from '../services/disappearing.service';
import { ApiService } from '../services/api';
import { E2EEService } from '../services/e2ee';

export interface ActiveCallState {
    peer: UserSummary;
    type: 'voice' | 'video';
    isIncoming?: boolean;
    incomingOffer?: any;
    callId?: string;
}

interface UseRealtimeSubscriptionsParams {
    /** Subscriptions are only attached once a user is signed in. */
    enabled: boolean;
    activeChatRef: React.MutableRefObject<string | null>;
    /** Latest chat list; a group message needs its Chat to find the sender's chain. */
    chatsRef: React.MutableRefObject<Chat[]>;
    activeCallRef: React.MutableRefObject<ActiveCallState | null>;
    /** Signed-in user, needed to tell "their" sealed messages from "mine". */
    currentUserIdRef: React.MutableRefObject<string | null>;
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
    setSmartReplies: React.Dispatch<React.SetStateAction<string[]>>;
    setTypingUsers: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    setOnlineUserIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    setActiveCall: React.Dispatch<React.SetStateAction<ActiveCallState | null>>;
    setCallSummaryData: React.Dispatch<React.SetStateAction<any | null>>;
    setTransportMode: React.Dispatch<React.SetStateAction<TransportMode>>;
    refreshChats: () => void | Promise<void>;
}

/**
 * Wires every server -> client WebSocket event into React state.
 *
 * Extracted from App.tsx so the realtime layer can be read (and reasoned about)
 * independently of the layout, and so the subscription set is attached once per
 * signed-in user instead of on every render.
 */
export function useRealtimeSubscriptions({
    enabled,
    activeChatRef,
    chatsRef,
    activeCallRef,
    currentUserIdRef,
    setMessages,
    setChats,
    setSmartReplies,
    setTypingUsers,
    setOnlineUserIds,
    setActiveCall,
    setCallSummaryData,
    setTransportMode,
    refreshChats,
}: UseRealtimeSubscriptionsParams) {
    // Callers re-create refreshChats every render; keep the latest one in a ref
    // so the subscriptions below never need to be torn down and re-attached.
    const refreshChatsRef = useRef(refreshChats);
    useEffect(() => {
        refreshChatsRef.current = refreshChats;
    });

    useEffect(() => {
        if (!enabled) return;

        // A. Receive new message (with deduplication)
        const unsubNewMsg = wsClient.on(
            'chat:new_message',
            async (payload: { message: Message; chat_id: string }) => {
                const { message, chat_id } = payload;
                sounds.playReceived();

                // Open sealed bodies *before* caching or rendering so an
                // encrypted message never flashes an empty bubble. The message
                // is inbound, so the key belongs to the sender. A group message
                // additionally needs its Chat, to fetch the sender's chain if the
                // distribution arrived after this message did.
                const chat = chatsRef.current.find((c) => c.id === chat_id) ?? null;
                await E2EEService.decryptIncoming(
                    message,
                    currentUserIdRef.current ?? '',
                    null,
                    chat
                );

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
                        refreshChatsRef.current();
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
            console.log(
                '📞 Received incoming WebRTC call from:',
                payload.caller?.display_name,
                payload
            );
            if (activeCallRef.current) {
                // If this is a duplicate delivery for the same call or same caller, ignore safely without hanging up
                if (
                    activeCallRef.current.callId === payload.call_id ||
                    activeCallRef.current.peer?.id === payload.caller_id
                ) {
                    console.log(
                        '[WebRTC] Duplicate/redundant incoming_call event received for active call with peer:',
                        payload.caller_id
                    );
                    return;
                }
                console.warn(
                    '[WebRTC] User is currently on another call with a different peer. Replying with busy.'
                );
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

            const active = activeCallRef.current;
            if (!active) return;

            const matchesCallId = !payload?.call_id || payload.call_id === active.callId;

            const matchesPeer = !payload?.user_id || payload.user_id === active.peer?.id;

            if (!matchesCallId && !matchesPeer) {
                return;
            }

            // Do NOT immediately setActiveCall(null) here.
            //
            // WebRTCManager owns media/peer-connection cleanup.
            // It will call onEndCall() after cleanup is complete.
            console.log('[App] Matching call-ended event. Waiting for WebRTCManager cleanup.');
        });

        // K. Auth Ack
        const unsubAuthAck = () => {
            setTransportMode('CLOUD');
            refreshChatsRef.current();
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
    }, [
        enabled,
        activeChatRef,
        activeCallRef,
        setMessages,
        setChats,
        setSmartReplies,
        setTypingUsers,
        setOnlineUserIds,
        setActiveCall,
        setCallSummaryData,
        setTransportMode,
        currentUserIdRef,
    ]);
}
