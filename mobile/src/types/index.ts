// ─── Shared Protocol Types ──────────────────────────────────────────
// Mirrored from backend/src/types/protocol.ts and client/src/types/index.ts

export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ChatType = 'DIRECT' | 'GROUP' | 'SUPERGROUP' | 'CHANNEL' | 'SAVED';
export type MessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'VOICE'
  | 'FILE'
  | 'SYSTEM'
  | 'LOCATION'
  | 'POLL';
export type ReceiptStatus = 'SENT' | 'DELIVERED' | 'READ' | 'QUEUED' | 'FAILED';

export interface User {
  id: string;
  phone_number: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  is_online?: boolean;
  is_bot?: boolean;
  last_seen_at?: string;
  created_at: string;
}

export interface UserSummary {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_online?: boolean;
  last_seen_at?: string;
  is_bot?: boolean;
  public_key?: string;
}

export interface Chat {
  id: string;
  type: ChatType;
  title?: string;
  description?: string;
  avatar_url?: string;
  creator_id?: string;
  is_e2ee: boolean;
  is_saved_messages?: boolean;
  member_count?: number;
  created_at: string;
  updated_at: string;
  peer_user?: UserSummary;
  last_message?: Message;
  unread_count?: number;
  is_muted?: boolean;
  pinned_message?: Message;
  members?: ChatMember[];
  safety_number?: string;
}

export interface ChatMember {
  id: string;
  chat_id: string;
  user_id: string;
  role: UserRole;
  last_read_message_id?: string;
  unread_count: number;
  is_muted: boolean;
  joined_at: string;
  user?: UserSummary;
}

export interface MediaMetadata {
  width?: number;
  height?: number;
  duration?: number;
  size?: number;
  blurhash?: string;
  mime_type?: string;
  file_name?: string;
  waveform?: number[];
}

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  faviconUrl?: string;
  type?: string;
}

export interface MessageSummary {
  id: string;
  sender_id: string;
  sender_name: string;
  content_text: string;
  type: MessageType;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  type: MessageType;
  content_text: string;
  ciphertext_payload?: string;
  media_url?: string;
  media_metadata?: MediaMetadata;
  thumbnail_url?: string;
  reply_to_message_id?: string;
  reply_to?: MessageSummary;
  linkPreview?: LinkPreview;
  poll_id?: string;
  is_pinned?: boolean;
  is_edited: boolean;
  edit_timestamp?: string;
  is_deleted: boolean;
  status: ReceiptStatus;
  created_at: string;
  updated_at: string;
  sender?: UserSummary;
  reactions?: Reaction[];
  isSending?: boolean;
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
}

export interface PollOption {
  id: string;
  text: string;
  vote_count: number;
  voter_ids: string[];
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  is_anonymous: boolean;
  is_quiz?: boolean;
  correct_option_id?: string;
  explanation?: string;
  multiple_choice?: boolean;
  close_date?: string;
  total_votes: number;
  closed: boolean;
}

export interface WsFrame {
  seq: number;
  type: string;
  payload: any;
  correlation_id?: string;
  timestamp?: string;
  error?: string;
}

export interface AuthPayload {
  user_id?: string;
  token?: string;
  user?: User;
  demo_account?: string;
}

export interface TypingPayload {
  chat_id: string;
  user_id: string;
  display_name: string;
  is_typing: boolean;
}

export interface PresencePayload {
  user_id: string;
  status: 'online' | 'offline';
  last_seen_at?: string;
}

export interface SendMessagePayload {
  temp_id: string;
  chat_id: string;
  type?: MessageType;
  content: string;
  reply_to_id?: string;
  ciphertext_payload?: string;
  media_url?: string;
  media_metadata?: MediaMetadata;
}

export interface WsMessageAck {
  temp_id: string;
  message_id: string;
  chat_id: string;
  status: ReceiptStatus;
  created_at?: string;
}

export interface WsReceiptUpdate {
  chat_id: string;
  message_id: string;
  user_id: string;
  status: ReceiptStatus;
  timestamp?: string;
}

export interface WsNewMessagePayload {
  chat_id: string;
  message: Message;
}

export interface UserSession {
  id: string;
  user_id: string;
  device_name: string;
  device_type: string;
  client_version?: string;
  ip_address?: string;
  last_active_at: string;
  created_at: string;
  is_current?: boolean;
}
