import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import UserAvatar from '../components/UserAvatar';

export default function SettingsScreen() {
  const { state, logout } = useApp();
  const user = state.user;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <UserAvatar
            uri={user?.avatar_url}
            name={user?.display_name || user?.username || '?'}
            size={72}
            showStatus={false}
          />
          <Text style={styles.profileName}>
            {user?.display_name || user?.username}
          </Text>
          <Text style={styles.profileStatus}>
            {state.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </Text>
        </View>

        {/* Info */}
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>User ID</Text>
            <Text style={styles.value}>{user?.id}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Phone</Text>
            <Text style={styles.value}>{user?.phone_number || 'Demo user'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Username</Text>
            <Text style={styles.value}>@{user?.username}</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Mobile v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1621',
  },
  header: {
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
  scroll: {
    paddingBottom: 40,
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: '#17212B',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#E8ECEF',
    marginTop: 12,
  },
  profileStatus: {
    fontSize: 14,
    color: '#7E93A0',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#17212B',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#242F3D',
  },
  label: {
    fontSize: 14,
    color: '#7E93A0',
  },
  value: {
    fontSize: 14,
    color: '#E8ECEF',
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  logoutBtn: {
    backgroundColor: '#3D1E1E',
    marginHorizontal: 16,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: '#EF5350',
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    color: '#5A7388',
    fontSize: 12,
    marginTop: 24,
  },
});
