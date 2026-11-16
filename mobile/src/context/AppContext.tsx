import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { User, Chat, Message, MessageType, MediaKind, WsFrame, ReceiptStatus, WsMessageAck, WsReceiptUpdate, WsNewMessagePayload } from '../types';
import WebSocketService from '../services/ws';
import api from '../services/api';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { DeviceService } from '../services/device';
import { E2EEService, PLAINTEXT_MARKER } from '../services/e2ee';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL || 'ws://localhost:4000/ws';

function deriveMessageType(mimeType: string): MessageType {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'FILE';
}

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
  /** Numeric device id this installation publishes its pre-key bundle under. */
  e2eeDeviceId: number;
  /** Last E2EE failure, shown to the user. */
  e2eeError: string | null;
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
  e2eeDeviceId: 0,
  e2eeError: null,
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
  | { type: 'CLEAR_TYPING'; chatId: string }
  | { type: 'SET_E2EE_DEVICE'; deviceId: number }
  | { type: 'SET_E2EE_ERROR'; error: string | null };

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
    case 'SET_E2EE_DEVICE':
      return { ...state, e2eeDeviceId: action.deviceId };
    case 'SET_E2EE_ERROR':
      return { ...state, e2eeError: action.error };
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────
export interface TwoFactorPrompt {
  requiresTwoFactor: true;
  challengeId: string;
  method: 'totp' | 'backup';
}

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  ws: WebSocketService | null;
  loginDemo: (account: string) => Promise<void>;
  login: (identifier: string, password: string) => Promise<TwoFactorPrompt | null>;
  submitTwoFactorCode: (challengeId: string, token: string) => Promise<void>;
  logout: () => void;
  loadChats: () => Promise<void>;
  loadMessages: (chatId: string) => Promise<void>;
  sendMessage: (chatId: string, content: string, replyToId?: string) => Promise<void>;
  sendImageMessage: (chatId: string) => Promise<void>;
  sendMediaMessage: (chatId: string, kind: MediaKind) => Promise<void>;
  updateProfile: (body: {
    displayName?: string;
    username?: string;
    bio?: string;
    avatarUrl?: string;
  }) => Promise<User>;
  sendTyping: (chatId: string) => void;
  markRead: (chatId: string) => Promise<void>;
  createDirectChat: (userId: string) => Promise<Chat>;
  createGroup: (title: string, memberIds: string[]) => Promise<Chat>;
  clearE2eeError: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = React.useRef<WebSocketService | null>(null);
  const typingTimers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const stateRef = React.useRef(state);
  stateRef.current = state;

  // ── E2EE helpers ───────────────────────────────────────────────────
  const chatFor = React.useCallback((chatId: string): Chat | undefined => {
    return stateRef.current.chats.find((chat) => chat.id === chatId);
  }, []);

  const decryptMessages = React.useCallback(
    async (messages: Message[], chatId: string) => {
      const user = stateRef.current.user;
      const deviceId = stateRef.current.e2eeDeviceId;
      if (!user || !deviceId) return;
      const chat = chatFor(chatId);
      await E2EEService.decryptAll(
        messages,
        user.id,
        deviceId,
        chat?.peer_user?.id ?? null,
        chat ?? null,
      );
    },
    [chatFor],
  );

  // ── Initialize WebSocket handlers ──────────────────────────────────
  const publishKeys = useCallback(async () => {
    const user = stateRef.current.user;
    if (!user) return;
    try {
      const deviceId = await DeviceService.ensureE2eeDeviceId(user.id);
      dispatch({ type: 'SET_E2EE_DEVICE', deviceId });
      await E2EEService.ensureIdentityPublished(user.id, deviceId);
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'unknown error';
      console.warn('E2EE key publication failed:', e);
      dispatch({
        type: 'SET_E2EE_ERROR',
        error: 'Encryption keys could not be published: ' + reason,
      });
    }
  }, []);

  const initWs = React.useCallback(
    (token: string, deviceId: string) => {
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
        void (async () => {
          await decryptMessages([msg], msg.chat_id);
          dispatch({ type: 'ADD_MESSAGE', chatId: msg.chat_id, message: msg });
          dispatch({
            type: 'UPDATE_CHAT',
            chat: { id: msg.chat_id, last_message: msg, unread_count: 1 },
          });
        })();
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
        void publishKeys();
      });

      ws.connect(token, deviceId);
    },
    [decryptMessages, publishKeys],
  );

  // ── Actions ────────────────────────────────────────────────────────
  const startSession = useCallback(
    async (user: User, token: string) => {
      api.setToken(token);
      dispatch({ type: 'SET_USER', user, token });
      const device = await DeviceService.getDeviceRecord(user.id);
      initWs(token, device.wsDeviceId);
    },
    [initWs],
  );

  const loginDemo = useCallback(
    async (account: string) => {
      const res = await api.loginDemo(account);
      await startSession(res.user, res.token);
    },
    [startSession],
  );

  const login = useCallback(
    async (identifier: string, password: string): Promise<TwoFactorPrompt | null> => {
      const res = await api.login(identifier, password);
      if ((res as { requiresTwoFactor?: boolean }).requiresTwoFactor) {
        const challenge = res as TwoFactorPrompt;
        return {
          requiresTwoFactor: true,
          challengeId: challenge.challengeId,
          method: challenge.method,
        };
      }
      const session = res as { user: User; token: string };
      await startSession(session.user, session.token);
      return null;
    },
    [startSession],
  );

  const submitTwoFactorCode = useCallback(
    async (challengeId: string, token: string) => {
      const res = await api.completeTwoFactorChallenge(challengeId, token);
      await startSession(res.user, res.token);
    },
    [startSession],
  );

  const logout = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    E2EEService.reset();
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

  const loadMessages = useCallback(
    async (chatId: string) => {
      try {
        const res = await api.getMessages(chatId);
        const messages = res.messages.reverse();
        await decryptMessages(messages, chatId);
        dispatch({ type: 'SET_MESSAGES', chatId, messages });
      } catch (e) {
        console.warn('Failed to load messages:', e);
      }
    },
    [decryptMessages],
  );

  const sendMessageAction = useCallback(
    async (chatId: string, content: string, replyToId?: string) => {
      const user = stateRef.current.user;
      const chat = chatFor(chatId);
      if (!user || !chat) return;

      // Seal the body before anything leaves the device. An E2EE chat that
      // cannot be sealed fails closed: the plaintext is never sent.
      let sealed: string;
      try {
        if (!chat.is_e2ee) {
          sealed = PLAINTEXT_MARKER;
        } else {
          const deviceId = stateRef.current.e2eeDeviceId;
          if (!deviceId) throw new Error('Encryption keys are not ready yet');
          sealed = await E2EEService.sealForChat(content, chat, user.id, deviceId);
        }
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Encryption failed';
        console.error('E2EE sealing failed, aborting send:', e);
        dispatch({ type: 'SET_E2EE_ERROR', error: 'Message not sent: ' + reason });
        return;
      }

      const isPlaintext = sealed === PLAINTEXT_MARKER;
      const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      // Optimistically add the message
      const optimisticMsg: Message = {
        id: tempId,
        chat_id: chatId,
        sender_id: user.id,
        type: 'TEXT',
        content_text: content,
        ciphertext_payload: isPlaintext ? undefined : sealed,
        status: 'SENT',
        is_deleted: false,
        is_edited: false,
        isSending: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      dispatch({ type: 'ADD_MESSAGE', chatId, message: optimisticMsg });
      dispatch({ type: 'SET_E2EE_ERROR', error: null });

      // Send via WebSocket (backend expects chat:send_message)
      wsRef.current?.send('chat:send_message', {
        temp_id: tempId,
        chat_id: chatId,
        type: 'TEXT',
        // A sealed body travels only as ciphertext: the plaintext must not
        // reach the server, or there is no encryption at all.
        content: isPlaintext ? content : '',
        ciphertext_payload: isPlaintext ? undefined : sealed,
        reply_to_id: replyToId,
      });
    },
    [chatFor],
  );

  const sendTyping = useCallback((chatId: string) => {
    // Backend expects chat:typing with { chat_id, is_typing }
    wsRef.current?.send('chat:typing', { chat_id: chatId, is_typing: true });
  }, []);

  const sendMediaMessage = useCallback(
    async (chatId: string, kind: MediaKind) => {
      if (kind === 'file') {
        throw new Error('File attachments are unavailable: expo-document-picker is not installed');
      }

      try {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          console.warn('Media library permission denied');
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === 'video' ? ['videos'] : ['images'],
          quality: 0.8,
        });
        if (result.canceled || !result.assets?.[0]) return;

        const asset = result.assets[0];
        const fileUri = asset.uri;
        const mimeType = asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg');
        const fileName = asset.fileName || fileUri.split('/').pop() || 'media';
        const messageType = deriveMessageType(mimeType);

        const base64 = await new File(fileUri).base64();

        const uploaded = await api.uploadMedia(base64, fileName, mimeType);
        const mediaUrl = uploaded.media?.url;
        if (!mediaUrl) return;

        const absoluteUrl = mediaUrl.startsWith('http')
          ? mediaUrl
          : api.getApiOrigin() + mediaUrl;

        const mediaMetadata = {
          width: asset.width,
          height: asset.height,
          size: asset.fileSize,
          mime_type: mimeType,
          file_name: fileName,
          ...(messageType === 'VIDEO' && asset.duration
            ? { duration: asset.duration / 1000 }
            : {}),
        };

        const user = stateRef.current.user;
        const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const optimisticMsg: Message = {
          id: tempId,
          chat_id: chatId,
          sender_id: user?.id || '',
          type: messageType,
          content_text: '',
          media_url: absoluteUrl,
          media_metadata: mediaMetadata,
          status: 'SENT',
          is_deleted: false,
          is_edited: false,
          isSending: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        dispatch({ type: 'ADD_MESSAGE', chatId, message: optimisticMsg });

        // Attachments carry no text body, so there is nothing to seal. The
        // media itself is not encrypted, exactly as in the browser client.
        wsRef.current?.send('chat:send_message', {
          temp_id: tempId,
          chat_id: chatId,
          type: messageType,
          content: '',
          media_url: absoluteUrl,
          media_metadata: mediaMetadata,
        });
      } catch (e) {
        console.warn('Failed to send media:', e);
        throw e;
      }
    },
    [],
  );

  const sendImageMessage = useCallback(
    async (chatId: string) => sendMediaMessage(chatId, 'image'),
    [sendMediaMessage],
  );

  const updateProfile = useCallback(
    async (body: {
      displayName?: string;
      username?: string;
      bio?: string;
      avatarUrl?: string;
    }) => {
      const res = await api.updateProfile(body);
      dispatch({ type: 'SET_USER', user: res.user, token: state.token || '' });
      return res.user;
    },
    [state.token],
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

  const clearE2eeError = useCallback(() => {
    dispatch({ type: 'SET_E2EE_ERROR', error: null });
  }, []);

  const value: AppContextType = {
    state,
    dispatch,
    ws: wsRef.current,
    loginDemo,
    login,
    submitTwoFactorCode,
    logout,
    loadChats,
    loadMessages,
    sendMessage: sendMessageAction,
    sendImageMessage,
    sendMediaMessage,
    updateProfile,
    sendTyping,
    markRead,
    createDirectChat,
    createGroup,
    clearE2eeError,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
