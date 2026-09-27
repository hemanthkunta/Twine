import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { User, Chat, Message, WsFrame, ReceiptStatus, WsMessageAck, WsReceiptUpdate, WsNewMessagePayload } from '../types';
import WebSocketService from '../services/ws';
import api from '../services/api';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const WS_URL = 'ws://localhost:4000/ws';

// ── State ────────────────────────────────────────────────────────────
interface AppState {
  user: User | null;
  token: string | null;
  chats: Chat[];
  activeChatId: string | null;
  messages: Record<string, Message[]>;
  onlineUsers: Set<string>;
  typingUsers: Record<string, { user_id: string; display_name: string }[]>;
  isConnected: boolean;
}

const initialState: AppState = {
  user: null,
  token: null,
  chats: [],
  activeChatId: null,
  messages: {},
  onlineUsers: new Set(),
  typingUsers: {},
  isConnected: false,
};

// ── Actions ──────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_USER'; user: User; token: string }
  | { type: 'LOGOUT' }
  | { type: 'SET_CHATS'; chats: Chat[] }
  | { type: 'ADD_CHAT'; chat: Chat }
  | { type: 'UPDATE_CHAT'; chat: Partial<Chat> & { id: string } }
  | { type: 'SET_ACTIVE_CHAT'; chatId: string | null }
  | { type: 'SET_MESSAGES'; chatId: string; messages: Message[] }
  | { type: 'ADD_MESSAGE'; chatId: string; message: Message }
  | { type: 'UPDATE_MESSAGE'; chatId: string; messageId: string; updates: Partial<Message> }
  | { type: 'SET_CONNECTED'; connected: boolean }
  | { type: 'SET_ONLINE'; userId: string; online: boolean }
  | { type: 'SET_TYPING'; chatId: string; users: { user_id: string; display_name: string }[] }
  | { type: 'CLEAR_TYPING'; chatId: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user, token: action.token };
    case 'LOGOUT':
      return { ...initialState };
    case 'SET_CHATS':
      return { ...state, chats: action.chats };
    case 'ADD_CHAT':
      return { ...state, chats: [action.chat, ...state.chats] };
    case 'UPDATE_CHAT': {
      const chats = state.chats.map((c) =>
        c.id === action.chat.id ? { ...c, ...action.chat } : c,
      );
      return { ...state, chats };
    }
    case 'SET_ACTIVE_CHAT':
      return { ...state, activeChatId: action.chatId };
    case 'SET_MESSAGES':
      return { ...state, messages: { ...state.messages, [action.chatId]: action.messages } };
    case 'ADD_MESSAGE': {
      const existing = state.messages[action.chatId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.id === action.message.id)) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatId]: [...existing, action.message],
        },
      };
    }
    case 'UPDATE_MESSAGE': {
      const msgs = state.messages[action.chatId];
      if (!msgs) return state;
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatId]: msgs.map((m) =>
            m.id === action.messageId ? { ...m, ...action.updates } : m,
          ),
        },
      };
    }
    case 'SET_CONNECTED':
      return { ...state, isConnected: action.connected };
    case 'SET_ONLINE': {
      const next = new Set(state.onlineUsers);
      if (action.online) next.add(action.userId);
      else next.delete(action.userId);
      return { ...state, onlineUsers: next };
    }
    case 'SET_TYPING':
      return {
        ...state,
        typingUsers: { ...state.typingUsers, [action.chatId]: action.users },
      };
    case 'CLEAR_TYPING':
      return {
        ...state,
        typingUsers: { ...state.typingUsers, [action.chatId]: [] },
      };
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  ws: WebSocketService | null;
  loginDemo: (account: string) => Promise<void>;
  logout: () => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (chatId: string, content: string, replyToId?: string) => void;
  sendImageMessage: (chatId: string) => Promise<void>;
  sendTyping: (chatId: string) => void;
  markRead: (chatId: string) => Promise<void>;
  createDirectChat: (userId: string) => Promise<Chat>;
  createGroup: (title: string, memberIds: string[]) => Promise<Chat>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = React.useRef<WebSocketService | null>(null);
  const typingTimers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Initialize WebSocket handlers ──────────────────────────────────
  const initWs = React.useCallback((token: string) => {
    if (wsRef.current) wsRef.current.disconnect();

    const ws = new WebSocketService(WS_URL);
    wsRef.current = ws;
    dispatch({ type: 'SET_CONNECTED', connected: false });

    ws.onConnect(() => dispatch({ type: 'SET_CONNECTED', connected: true }));
    ws.onDisconnect(() => dispatch({ type: 'SET_CONNECTED', connected: false }));

    // Handle incoming events (aligned with backend protocol)
    ws.on('chat:new_message', (frame: WsFrame) => {
      const payload = frame.payload as WsNewMessagePayload;
      const msg = payload.message;
      dispatch({ type: 'ADD_MESSAGE', chatId: msg.chat_id, message: msg });
      dispatch({
        type: 'UPDATE_CHAT',
        chat: { id: msg.chat_id, last_message: msg, unread_count: 1 },
      });
    });

    ws.on('chat:message_ack', (frame: WsFrame) => {
      const ack = frame.payload as WsMessageAck;
      // Update temp message with real id and status
      dispatch({
        type: 'UPDATE_MESSAGE',
        chatId: ack.chat_id,
        messageId: ack.temp_id,
        updates: { id: ack.message_id, status: ack.status, created_at: ack.created_at },
      });
      // Also update by real message id if temp_id didn't match
      if (ack.message_id) {
        dispatch({
          type: 'UPDATE_MESSAGE',
          chatId: ack.chat_id,
          messageId: ack.message_id,
          updates: { status: ack.status },
        });
      }
    });

    ws.on('chat:receipt_update', (frame: WsFrame) => {
      const receipt = frame.payload as WsReceiptUpdate;
      dispatch({
        type: 'UPDATE_MESSAGE',
        chatId: receipt.chat_id,
        messageId: receipt.message_id,
        updates: { status: receipt.status },
      });
    });

    ws.on('presence:update', (frame: WsFrame) => {
      const { user_id, status } = frame.payload as {
        user_id: string;
        status: 'online' | 'offline';
      };
      dispatch({ type: 'SET_ONLINE', userId: user_id, online: status === 'online' });
    });

    ws.on('chat:user_typing', (frame: WsFrame) => {
      const { chat_id, user_id, display_name, is_typing } = frame.payload as {
        chat_id: string;
        user_id: string;
        display_name: string;
        is_typing: boolean;
      };
      if (is_typing) {
        dispatch({
          type: 'SET_TYPING',
          chatId: chat_id,
          users: [{ user_id, display_name }],
        });
        // Clear typing after 4 seconds
        const timerKey = chat_id + ':' + user_id;
        const existing = typingTimers.current.get(timerKey);
        if (existing) clearTimeout(existing);
        typingTimers.current.set(
          timerKey,
          setTimeout(() => {
            dispatch({ type: 'CLEAR_TYPING', chatId: chat_id });
            typingTimers.current.delete(timerKey);
          }, 4000),
        );
      } else {
        dispatch({ type: 'CLEAR_TYPING', chatId: chat_id });
      }
    });

    ws.on('auth:ack', (frame: WsFrame) => {
      // Auth acknowledged - user is now fully connected
      console.log('Auth acknowledged:', frame.payload);
    });

    ws.connect(token);
  }, []);

  // ── Actions ────────────────────────────────────────────────────────
  const loginDemo = useCallback(async (account: string) => {
    const res = await api.loginDemo(account);
    api.setToken(res.token);
    dispatch({ type: 'SET_USER', user: res.user, token: res.token });
    initWs(res.token);
  }, [initWs]);

  const logout = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    dispatch({ type: 'LOGOUT' });
  }, []);

  const loadChats = useCallback(async () => {
    try {
      const res = await api.getChats();
      dispatch({ type: 'SET_CHATS', chats: res.chats });
    } catch (e) {
      console.warn('Failed to load chats:', e);
    }
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    try {
      const res = await api.getMessages(chatId);
      dispatch({ type: 'SET_MESSAGES', chatId, messages: res.messages.reverse() });
    } catch (e) {
      console.warn('Failed to load messages:', e);
    }
  }, []);

  const sendMessageAction = useCallback(
    (chatId: string, content: string, replyToId?: string) => {
      const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      // Optimistically add the message
      const optimisticMsg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: state.user?.id || '',
        type: 'TEXT',
        content_text: content,
        status: 'SENT',
        is_deleted: false,
        is_edited: false,
        isSending: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_MESSAGE', chatId, message: optimisticMsg });

      // Send via WebSocket (backend expects chat:send_message)
      wsRef.current?.send('chat:send_message', {
        temp_id: tempId,
        chat_id: chatId,
        type: 'TEXT',
        content,
        reply_to_id: replyToId,
      });
    },
    [state.user?.id],
  );

  const sendTyping = useCallback((chatId: string) => {
    // Backend expects chat:typing with { chat_id, is_typing }
    wsRef.current?.send('chat:typing', { chat_id: chatId, is_typing: true });
  }, []);

  const sendImageMessage = useCallback(
    async (chatId: string) => {
      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          console.warn('Media library permission denied');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const fileUri = asset.uri;
        const mimeType = asset.mimeType || 'image/jpeg';
        const fileName = fileUri.split('/').pop() || 'photo.jpg';

        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const uploaded = await api.uploadMedia(base64, fileName, mimeType);
        const mediaUrl = uploaded.media?.url;
        if (!mediaUrl) return;

        const absoluteUrl = mediaUrl.startsWith('http')
          ? mediaUrl
          : 'http://localhost:4000' + mediaUrl;

        const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const optimisticMsg: Message = {
          id: tempId,
          chat_id: chatId,
          sender_id: state.user?.id || '',
          type: 'IMAGE',
          content_text: '',
          media_url: absoluteUrl,
          media_metadata: {
            width: asset.width,
            height: asset.height,
            size: asset.fileSize,
            mime_type: mimeType,
            file_name: fileName,
          },
          status: 'SENT',
          is_deleted: false,
          is_edited: false,
          isSending: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_MESSAGE', chatId, message: optimisticMsg });

        wsRef.current?.send('chat:send_message', {
          temp_id: tempId,
          chat_id: chatId,
          type: 'IMAGE',
          content: '',
          media_url: absoluteUrl,
          media_metadata: {
            width: asset.width,
            height: asset.height,
            size: asset.fileSize,
            mime_type: mimeType,
            file_name: fileName,
          },
        });
      } catch (e) {
        console.warn('Failed to send image:', e);
      }
    },
    [state.user?.id],
  );

  const markRead = useCallback(async (chatId: string) => {
    try {
      await api.markRead(chatId);
    } catch (e) {
      console.warn('Failed to mark read:', e);
    }
  }, []);

  const createDirectChat = useCallback(async (userId: string) => {
    const res = await api.createDirectChat(userId);
    dispatch({ type: 'ADD_CHAT', chat: res.chat });
    return res.chat;
  }, []);

  const createGroup = useCallback(async (title: string, memberIds: string[]) => {
    const res = await api.createGroup(title, memberIds);
    dispatch({ type: 'ADD_CHAT', chat: res.chat });
    return res.chat;
  }, []);

  const value: AppContextType = {
    state,
    dispatch,
    ws: wsRef.current,
    loginDemo,
    logout,
    loadChats,
    loadMessages,
    sendMessage: sendMessageAction,
    sendImageMessage,
    sendTyping,
    markRead,
    createDirectChat,
    createGroup,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
