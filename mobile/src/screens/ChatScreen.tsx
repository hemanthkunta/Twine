import React, { useEffect, useRef } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Chat, Message } from '../types';
import { useApp } from '../context/AppContext';
import MessageBubble from '../components/MessageBubble';
import MessageInput from '../components/MessageInput';
import TypingIndicator from '../components/TypingIndicator';
import UserAvatar from '../components/UserAvatar';

interface Props {
  chat: Chat;
  onBack: () => void;
}

export default function ChatScreen({ chat, onBack }: Props) {
  const { state, loadMessages, sendMessage, sendImageMessage, sendTyping, markRead } = useApp();
  const flatRef = useRef<FlatList>(null);
  const messages = state.messages[chat.id] || [];
  const typingUsers = state.typingUsers[chat.id] || [];
  const isOnline = chat.type === 'DIRECT' ? chat.peer_user?.is_online : undefined;

  const title =
    chat.type === 'DIRECT'
      ? chat.peer_user?.display_name || chat.peer_user?.username || 'Unknown'
      : chat.title || 'Group';
  const avatarName =
    chat.type === 'DIRECT'
      ? chat.peer_user?.display_name || chat.peer_user?.username || '?'
      : chat.title || 'G';
  const avatarUrl =
    chat.type === 'DIRECT' ? chat.peer_user?.avatar_url : chat.avatar_url;

  useEffect(() => {
    loadMessages(chat.id);
    // Mark messages as read when opening chat
    markRead(chat.id);
  }, [chat.id, loadMessages, markRead]);

  const handleSend = (text: string) => {
    sendMessage(chat.id, text);
  };

  const handleReply = (msg: Message) => {
    // For a real app, show a reply bar above the input
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <UserAvatar
          uri={avatarUrl}
          name={avatarName}
          size={36}
          isOnline={isOnline}
          showStatus={true}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {typingUsers.length > 0 ? (
            <Text style={styles.typingText}>
              {typingUsers.map((u) => u.display_name).join(', ')} typing...
            </Text>
          ) : isOnline !== undefined ? (
            <Text style={[styles.statusText, { color: isOnline ? '#31C48D' : '#7E93A0' }]}>
              {isOnline ? 'online' : 'offline'}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isOwn={item.sender_id === state.user?.id}
            onReply={handleReply}
          />
        )}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatRef.current?.scrollToEnd({ animated: true })
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Send a message to start the conversation</Text>
          </View>
        }
      />

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <TypingIndicator name={typingUsers[0].display_name} />
      )}

      {/* Input */}
      <MessageInput
        onSend={handleSend}
        onSendImage={() => sendImageMessage(chat.id)}
        onTyping={() => sendTyping(chat.id)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1621',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 50,
    paddingBottom: 8,
    backgroundColor: '#17212B',
    borderBottomWidth: 1,
    borderBottomColor: '#242F3D',
  },
  backBtn: {
    paddingRight: 10,
    paddingVertical: 4,
  },
  backIcon: {
    fontSize: 22,
    color: '#E8ECEF',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#E8ECEF',
  },
  typingText: {
    fontSize: 12,
    color: '#4FC3F7',
    fontStyle: 'italic',
  },
  statusText: {
    fontSize: 12,
  },
  messageList: {
    flexGrow: 1,
    paddingVertical: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#7E93A0',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#5A7388',
  },
});
