import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Chat } from '../types';
import UserAvatar from './UserAvatar';
import StatusTicks from './StatusTicks';

interface Props {
  chat: Chat;
  onPress: (chat: Chat) => void;
}

export default function ChatListItem({ chat, onPress }: Props) {
  const title =
    chat.type === 'DIRECT'
      ? chat.peer_user?.display_name || chat.peer_user?.username || 'Unknown'
      : chat.title || 'Unnamed Group';
  const avatarName =
    chat.type === 'DIRECT'
      ? chat.peer_user?.display_name || chat.peer_user?.username || '?'
      : chat.title || 'G';
  const avatarUrl =
    chat.type === 'DIRECT' ? chat.peer_user?.avatar_url : chat.avatar_url;
  const isOnline =
    chat.type === 'DIRECT' ? chat.peer_user?.is_online : undefined;
  const lastMsg = chat.last_message;

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (isToday) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress(chat)} activeOpacity={0.7}>
      <UserAvatar
        uri={avatarUrl}
        name={avatarName}
        size={52}
        isOnline={isOnline}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.time}>{formatTime(lastMsg?.created_at)}</Text>
        </View>
        <View style={styles.bottomRow}>
          {lastMsg ? (
            <Text style={styles.preview} numberOfLines={1}>
              {lastMsg.type === 'IMAGE'
                ? '📷 Photo'
                : lastMsg.content_text || ''}
            </Text>
          ) : (
            <Text style={styles.previewMuted}>No messages yet</Text>
          )}
          {chat.unread_count != null && chat.unread_count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {chat.unread_count > 99 ? '99+' : chat.unread_count}
              </Text>
            </View>
          )}
          {lastMsg && (lastMsg.status === 'SENT' || lastMsg.status === 'DELIVERED') && (
            <StatusTicks status={lastMsg.status} size={10} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#17212B',
    borderBottomWidth: 0.5,
    borderBottomColor: '#242F3D',
  },
  content: {
    flex: 1,
    marginLeft: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E8ECEF',
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: '#7E93A0',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  preview: {
    fontSize: 14,
    color: '#7E93A0',
    flex: 1,
    marginRight: 8,
  },
  previewMuted: {
    fontSize: 14,
    color: '#5A7388',
    flex: 1,
    marginRight: 8,
    fontStyle: 'italic',
  },
  badge: {
    backgroundColor: '#2B5278',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
