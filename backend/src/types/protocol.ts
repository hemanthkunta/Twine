// Comprehensive Protocol Definitions for Telegram-like Platform

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

/**
 * Structural stand-ins for the browser's SessionDescriptionInit and
 * IceCandidateInit.
 *
 * The backend never inspects these objects — it only forwards them verbatim to
 * the other peer — so it must not depend on the browser's DOM type definitions.
 * Referencing the DOM types would drag the whole DOM lib into the server build
 * and silently allow browser-only APIs to compile in Node code.
 */
export interface SessionDescriptionInit {
    type: 'offer' | 'answer' | 'pranswer' | 'rollback';
    sdp?: string;
}

export interface IceCandidateInit {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
}

export interface User {
    id: string;
    phone_number: string;
    username: string;
    display_name: string;
    bio?: string;
    avatar_url?: string;
    password_hash?: string;
    is_2fa_enabled?: boolean;
    is_bot?: boolean;
    last_seen_at?: string;
    created_at: string;
    updated_at: string;
    is_online?: boolean;
}

export interface UserSummary {
    id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
    is_online?: boolean;
    last_seen_at?: string;
    is_bot?: boolean;
}

export interface Reaction {
    emoji: string;
    count: number;
    users: string[]; // user IDs who reacted
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
    peer_user?: UserSummary; // For 1:1 DIRECT chats
    last_message?: Message;
    unread_count?: number;
    is_muted?: boolean;
    pinned_message?: Message;
    members?: ChatMember[];
    safety_number?: string; // For E2EE verification in direct chats
}

export interface Message {
    id: string;
    chat_id: string;
    sender_id: string;
    reply_to_message_id?: string;
    reply_to?: MessageSummary;
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
    linkPreview?: {
        url: string;
        title?: string;
        description?: string;
        imageUrl?: string;
        siteName?: string;
        faviconUrl?: string;
        type?: string;
    };
    poll?: Poll;
    views_count?: number;
    thread_message_count?: number;
    reactions?: Record<string, string[]>; // emoji -> array of user IDs
    is_pinned?: boolean;
    is_edited: boolean;
    edit_timestamp?: string;
    is_deleted: boolean;
    created_at: string;
    status: ReceiptStatus;
    sender?: UserSummary;
    isSending?: boolean;
}

export interface MessageSummary {
    id: string;
    sender_id: string;
    sender_name: string;
    content_text: string;
    type: MessageType;
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

// WebSocket Envelope Frame
export interface WSFrame<T = any> {
    seq?: number;
    type: string;
    payload: T;
    correlation_id?: string;
    timestamp: number;
}

// WebRTC Signaling Types
export interface WebRTCCallPayload {
    call_id: string;
    caller_id: string;
    target_user_id: string;
    call_type: 'voice' | 'video';
    caller: UserSummary;
    offer: SessionDescriptionInit;
}

export interface WebRTCAnswerPayload {
    call_id: string;
    target_user_id: string;
    answer: SessionDescriptionInit;
}

export interface WebRTCIceCandidatePayload {
    call_id: string;
    target_user_id: string;
    candidate: IceCandidateInit;
}

export interface WebRTCHangupPayload {
    call_id: string;
    target_user_id: string;
    reason?: string;
}

// Client -> Server Payloads
export interface WSAuthHandshakePayload {
    token: string;
    device_id?: string;
    device_type?: string;
}

export interface WSWebRtcCallUserPayload {
    call_id: string;
    target_user_id: string;
    call_type: 'voice' | 'video';
    offer: SessionDescriptionInit;
}

export interface WSWebRtcAnswerPayload {
    call_id: string;
    target_user_id: string;
    answer: SessionDescriptionInit;
}

export interface WSWebRtcIceCandidatePayload {
    call_id: string;
    target_user_id: string;
    candidate: IceCandidateInit;
}

export interface WSWebRtcHangupPayload {
    call_id: string;
    target_user_id: string;
    reason?: string;
}

export interface WSWebRtcRenegotiatePayload {
    call_id: string;
    target_user_id: string;
    offer: SessionDescriptionInit;
    answer: SessionDescriptionInit;
    is_screen_sharing?: boolean;
    is_video_active?: boolean;
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

export interface WSSendMessagePayload {
    temp_id: string;
    chat_id: string;
    type?: MessageType;
    content: string;
    reply_to_id?: string;
    ciphertext_payload?: string;
    media_url?: string;
    media_metadata?: MediaMetadata;
    poll?: Poll;
}

export interface WSEditMessagePayload {
    message_id: string;
    chat_id: string;
    content_text: string;
}

export interface WSDeleteMessagePayload {
    message_id: string;
    chat_id: string;
}

export interface WSReactPayload {
    message_id: string;
    chat_id: string;
    emoji: string;
}

export interface WSPinMessagePayload {
    message_id: string;
    chat_id: string;
    is_pinned: boolean;
}

export interface WSTypingPayload {
    chat_id: string;
    is_typing: boolean;
}

export interface WSReadReceiptPayload {
    chat_id: string;
    message_id: string;
}

export interface WSHeartbeatPayload {
    status: 'online' | 'away';
}

// E2EE Group Key Distribution
export interface WSSenderKeyDistributionPayload {
    chat_id: string;
    sender_id: string;
    chain_key_hex: string;
    iteration: number;
    signing_pub_key_hex: string;
}

export interface WSSenderKeyDistributionBroadcastPayload {
    chat_id: string;
    sender_id: string;
    chain_key_hex: string;
    iteration: number;
    signing_pub_key_hex: string;
}

export interface WSRequestSenderKeyPayload {
    chat_id: string;
    sender_id: string;
}

// Signal Protocol X3DH Key Exchange for E2EE
export interface WSRequestPreKeyBundlePayload {
    user_id: string;
}

export interface WSPreKeyBundlePayload {
    user_id: string;
    registration_id: number;
    device_id: number;
    pre_key_id: number;
    pre_key_public: string;
    signed_pre_key_id: number;
    signed_pre_key_public: string;
    signed_pre_key_signature: string;
    identity_key: string;
}

// Server -> Client Broadcast Payloads
export interface WSAuthAckPayload {
    user: User;
    device_id?: string;
    session_id?: string;
    active_users_count?: number;
}

export interface WSMessageAckPayload {
    temp_id: string;
    message_id: string;
    chat_id: string;
    status: ReceiptStatus;
    created_at?: string;
}

export interface WSNewMessagePayload {
    chat_id: string;
    message: Message;
}

export interface WSReceiptUpdatePayload {
    chat_id: string;
    message_id: string;
    user_id: string;
    status: ReceiptStatus;
    timestamp?: string;
}

export interface WSPresenceUpdatePayload {
    user_id: string;
    is_online: boolean;
    last_seen_at?: string;
}

export interface WSUserTypingPayload {
    chat_id: string;
    user_id: string;
    display_name: string;
    username?: string;
    is_typing: boolean;
}
