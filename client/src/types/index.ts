export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ChatType = 'DIRECT' | 'GROUP' | 'SUPERGROUP' | 'CHANNEL' | 'SAVED';
export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'VOICE' | 'FILE' | 'SYSTEM' | 'LOCATION' | 'POLL';
export type ReceiptStatus = 'SENT' | 'DELIVERED' | 'READ' | 'QUEUED';
export type TransportMode = 'CLOUD' | 'MESH' | 'QUEUED';

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

export interface ChatMember {
  id: string;
  chat_id: string;
  user_id: string;
  role: UserRole;
  user?: UserSummary;
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
  pinned_message?: Message;
  members?: ChatMember[];
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
  total_votes: number;
  closed: boolean;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  reply_to_message_id?: string;
  reply_to?: {
    id: string;
    sender_id: string;
    sender_name: string;
    content_text: string;
    type: MessageType;
  };
  type: MessageType;
  content_text: string;
  ciphertext_payload?: string;
  media_url?: string;
  media_metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    size?: number;
    blurhash?: string;
    mime_type?: string;
    file_name?: string;
    waveform?: number[];
  };
  poll?: Poll;
  views_count?: number;
  thread_message_count?: number;
  reactions?: Record<string, string[]>; // emoji -> user IDs
  is_pinned?: boolean;
  is_edited: boolean;
  edit_timestamp?: string;
  is_deleted: boolean;
  created_at: string;
  status: ReceiptStatus;
  sender?: UserSummary;
  isSending?: boolean;
  translatedText?: string;
  transport_mode?: TransportMode;
  hop_count?: number;
  relayed_by?: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  device_name: string;
  device_type: string;
  client_version?: string;
  ip_address?: string;
  is_current?: boolean;
  last_active_at: string;
  created_at: string;
}

export interface WSFrame<T = any> {
  seq: number;
  type: string;
  payload: T;
  correlation_id?: string;
  timestamp: string | number;
}

// Phase 1 Mesh & Radio Types
export interface MeshPacket {
  packet_id: string;
  sender_pubkey: string;
  sender_name: string;
  recipient_pubkey?: string;
  chat_id: string;
  hop_count: number;
  max_hops: number;
  payload_ciphertext: string;
  nonce: string;
  timestamp: number;
}

export interface MeshPeer {
  id: string;
  name: string;
  pubkey: string;
  rssi: number;
  hops: number;
  last_seen: number;
  transport: 'BLE' | 'WEBRTC_LOCAL' | 'LORA_RADIO';
  is_connected: boolean;
}

export interface LoRaDeviceConfig {
  portName?: string;
  baudRate: number;
  frequencyMHz: number;
  spreadingFactor?: number;
  bandwidthKhz?: number;
  txPowerDbm?: number;
  txPower?: number;
  channelName?: string;
  isConnected: boolean;
}

// Phase 4 & 5 Federation and Push Types
export interface MatrixBridgeStatus {
  enabled: boolean;
  homeserver: string;
  roomAlias: string;
  federationConnected: boolean;
  syncedEventsCount: number;
  lastSyncTime: string;
}

export interface ChannelAnalytics {
  subscriberCount: number;
  totalViews: number;
  viewsLast24h: number;
  engagementRate: string;
  topPosts: { id: string; text: string; views: number; reactions: number }[];
  viewsByHour: { hour: string; views: number }[];
}
