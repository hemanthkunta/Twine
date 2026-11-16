import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useRealtimeSubscriptions } from '../src/hooks/useRealtimeSubscriptions';
import { wsClient } from '../src/services/ws';
import type { Chat, Message } from '../src/types';

// Browser regression harness. Mounts the production hook with an inactive chat;
// transport events are synthetic so overlap, ordering and expiry are deterministic.
export async function runCoreRealtimeChecks() {
    const passed: string[] = [];
    const host = document.createElement('div');
    const root = createRoot(host);
    let state: { chats: Chat[]; typing: Map<string, string>; messages: Message[] };
    const inactiveMessage = { id: 'core-message', chat_id: 'inactive', status: 'SENT' } as Message;
    const activeMessage = { id: 'active-message', chat_id: 'other', status: 'SENT' } as Message;
    function Harness() {
        const [chats, setChats] = useState([{ id: 'inactive', last_message: inactiveMessage }] as Chat[]);
        const [typing, setTypingUsers] = useState(new Map<string, string>());
        const [messages, setMessages] = useState<Message[]>([activeMessage]);
        const [, setSmartReplies] = useState<string[]>([]);
        const [, setOnlineUserIds] = useState(new Set<string>());
        const [, setActiveCall] = useState<any>(null);
        const [, setCallSummaryData] = useState<any>(null);
        const [, setTransportMode] = useState<any>('CLOUD');
        useRealtimeSubscriptions({ enabled: true, activeChatRef: useRef('other'), chatsRef: useRef(chats),
            activeCallRef: useRef(null), currentUserIdRef: useRef('self'), setMessages, setChats, setSmartReplies,
            setTypingUsers, setOnlineUserIds, setActiveCall, setCallSummaryData, setTransportMode, refreshChats: () => {} });
        state = { chats, typing, messages };
        return null;
    }
    const check = (name: string, value: boolean) => { if (!value) throw new Error(name); passed.push(name); };
    const emit = (type: string, payload: any) => act(() => {
        for (const callback of (wsClient as any).listeners.get(type) ?? []) callback(payload, { type, payload });
    });
    try {
        act(() => { root.render(<Harness />); });
        emit('chat:receipt_update', { chat_id: 'inactive', message_id: 'core-message', status: 'READ' });
        check('inactive-chat receipt updates sidebar', state!.chats[0].last_message?.status === 'READ');
        emit('chat:receipt_update', { chat_id: 'inactive', message_id: 'core-message', status: 'DELIVERED' });
        check('late delivery cannot downgrade read', state!.chats[0].last_message?.status === 'READ');
        const typing = (user: string, active: boolean) => emit('chat:user_typing', { chat_id: 'group', user_id: user, display_name: user, is_typing: active });
        typing('one', true); typing('two', true);
        check('concurrent typists retained', state!.typing.get('group') === 'one, two');
        typing('one', false);
        check('one stop does not erase another typist', state!.typing.get('group') === 'two');
        emit('presence:update', { user_id: 'two', is_online: false });
        check('disconnect clears typist', !state!.typing.has('group'));
        typing('three', true);
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 7200)); });
        check('missing stop expires automatically', !state!.typing.has('group'));
        emit('chat:receipt_update', { chat_id: 'other', message_id: 'active-message', status: 'READ' });
        check('active-chat receipt updates visible message', state!.messages[0].status === 'READ');
        return passed;
    } finally { act(() => { root.unmount(); }); }
}
