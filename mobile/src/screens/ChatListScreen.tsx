import React, { useEffect, useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Chat } from '../types';
import { useApp } from '../context/AppContext';
import ChatListItem from '../components/ChatListItem';
import NewChatModal from '../components/NewChatModal';

interface Props {
  onChatPress: (chat: Chat) => void;
  onSettings: () => void;
}

export default function ChatListScreen({ onChatPress, onSettings }: Props) {
  const { state, loadChats } = useApp();
  const [newChatVisible, setNewChatVisible] = useState(false);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerRight}>
          <View style={styles.connectionDot}>
            <Text style={{ fontSize: 10 }}>{state.isConnected ? '🟢' : '🔴'}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setNewChatVisible(true)}
            style={styles.newChatBtn}>
            <Text style={styles.newChatIcon}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSettings} style={styles.settingsBtn}>
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={state.chats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatListItem chat={item} onPress={onChatPress} />
        )}
        contentContainerStyle={state.chats.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap + to start a new conversation
            </Text>
          </View>
        }
      />

      <NewChatModal
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        onOpenChat={(chat) => {
          loadChats();
          onChatPress(chat);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1621',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#17212B',
    borderBottomWidth: 1,
    borderBottomColor: '#242F3D',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E8ECEF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectionDot: {},
  newChatBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2B5278',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newChatIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E2C3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 18,
  },
  emptyContainer: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E8ECEF',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#7E93A0',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
