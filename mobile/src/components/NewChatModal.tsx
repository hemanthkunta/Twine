import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { User, Chat } from '../types';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import UserAvatar from './UserAvatar';

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenChat: (chat: Chat) => void;
}

type Mode = 'direct' | 'group';

export default function NewChatModal({ visible, onClose, onOpenChat }: Props) {
  const { createDirectChat, createGroup } = useApp();
  const [mode, setMode] = useState<Mode>('direct');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.searchUsers(query.trim());
      setUsers(res.users || []);
    } catch (e: any) {
      setError(e.message || 'Failed to search users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (visible) {
      loadUsers();
    } else {
      setQuery('');
      setUsers([]);
      setSelected(new Set());
      setGroupTitle('');
      setError(null);
      setMode('direct');
    }
  }, [visible, loadUsers]);

  const toggleSelected = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const openDirect = async (user: User) => {
    try {
      setCreating(true);
      setError(null);
      const chat = await createDirectChat(user.id);
      onClose();
      onOpenChat(chat);
    } catch (e: any) {
      setError(e.message || 'Failed to create chat');
    } finally {
      setCreating(false);
    }
  };

  const createGroupChat = async () => {
    if (!groupTitle.trim()) {
      setError('Group name is required');
      return;
    }
    if (selected.size < 1) {
      setError('Select at least one member');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const chat = await createGroup(groupTitle.trim(), Array.from(selected));
      onClose();
      onOpenChat(chat);
    } catch (e: any) {
      setError(e.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const filtered = users.filter((u) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.display_name?.toLowerCase().includes(q)
    );
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>New Chat</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[styles.tab, mode === 'direct' && styles.tabActive]}
            onPress={() => setMode('direct')}>
            <Text style={[styles.tabText, mode === 'direct' && styles.tabTextActive]}>
              Direct
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'group' && styles.tabActive]}
            onPress={() => setMode('group')}>
            <Text style={[styles.tabText, mode === 'group' && styles.tabTextActive]}>
              Group
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'direct' ? (
          <>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name or @username"
              placeholderTextColor="#5E7A8E"
              autoCapitalize="none"
            />

            {loading ? (
              <ActivityIndicator color="#4FC3F7" style={styles.loader} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.userRow}
                    disabled={creating}
                    onPress={() => openDirect(item)}
                    activeOpacity={0.7}>
                    <UserAvatar
                      uri={item.avatar_url}
                      name={item.display_name || item.username}
                      size={44}
                      isOnline={item.is_online}
                    />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.display_name || item.username}
                      </Text>
                      <Text style={styles.userHandle}>@{item.username}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No users found</Text>
                    <Text style={styles.emptySubtitle}>Try a different search</Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <View style={styles.groupContainer}>
            <TextInput
              style={styles.searchInput}
              value={groupTitle}
              onChangeText={setGroupTitle}
              placeholder="Group name"
              placeholderTextColor="#5E7A8E"
            />
            <Text style={styles.selectedCount}>
              {selected.size} selected
            </Text>
            <FlatList
              data={users}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selected.has(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.userRow, isSelected && styles.userRowSelected]}
                    onPress={() => toggleSelected(item.id)}
                    activeOpacity={0.7}>
                    <UserAvatar
                      uri={item.avatar_url}
                      name={item.display_name || item.username}
                      size={40}
                    />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {item.display_name || item.username}
                      </Text>
                      <Text style={styles.userHandle}>@{item.username}</Text>
                    </View>
                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Text style={styles.checkboxIcon}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={createGroupChat}
              disabled={creating}>
              {creating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.createButtonText}>Create Group</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: '#17212B',
    borderBottomWidth: 1,
    borderBottomColor: '#242F3D',
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#E8ECEF',
    fontSize: 22,
  },
  title: {
    color: '#E8ECEF',
    fontSize: 18,
    fontWeight: '700',
  },
  placeholder: {
    width: 36,
  },
  modeTabs: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
    backgroundColor: '#17212B',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#1E2C3A',
  },
  tabActive: {
    backgroundColor: '#2B5278',
  },
  tabText: {
    color: '#7E93A0',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  searchInput: {
    backgroundColor: '#15232E',
    borderRadius: 10,
    marginHorizontal: 12,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#E8ECEF',
    fontSize: 15,
  },
  loader: {
    marginTop: 24,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#242F3D',
  },
  userRowSelected: {
    backgroundColor: '#1B2C3D',
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    color: '#E8ECEF',
    fontSize: 15,
    fontWeight: '600',
  },
  userHandle: {
    color: '#7E93A0',
    fontSize: 13,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#5E7A8E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#2B5278',
    borderColor: '#2B5278',
  },
  checkboxIcon: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  groupContainer: {
    flex: 1,
  },
  selectedCount: {
    color: '#7E93A0',
    fontSize: 13,
    marginHorizontal: 14,
    marginTop: 8,
  },
  createButton: {
    backgroundColor: '#2B5278',
    margin: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    color: '#E8ECEF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: '#7E93A0',
    fontSize: 13,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: '#3D1E1E',
    margin: 12,
    padding: 10,
    borderRadius: 8,
  },
  errorText: {
    color: '#EF5350',
    textAlign: 'center',
    fontSize: 13,
  },
});
