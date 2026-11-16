import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useApp } from '../context/AppContext';
import UserAvatar from '../components/UserAvatar';
import api from '../services/api';

export default function SettingsScreen() {
  const { state, logout, updateProfile } = useApp();
  const user = state.user;
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name);
  }, [user?.display_name]);

  const handleChangePhoto = async () => {
    if (uploading) return;
    setError(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library permission denied');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const fileName = asset.fileName || asset.uri.split('/').pop() || 'avatar.jpg';

      setUploading(true);
      const base64 = await new File(asset.uri).base64();
      const uploaded = await api.uploadMedia(base64, fileName, mimeType);
      const mediaUrl = uploaded.media?.url;
      if (!mediaUrl) throw new Error('Upload did not return a media URL');

      await updateProfile({ avatarUrl: mediaUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the profile photo');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Display name cannot be empty');
      return;
    }
    if (trimmed === user?.display_name) return;

    setSaving(true);
    setError(null);
    try {
      await updateProfile({ displayName: trimmed });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the display name');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            onPress={handleChangePhoto}
            disabled={uploading}
            style={styles.avatarTap}>
            <UserAvatar
              uri={user?.avatar_url}
              name={user?.display_name || user?.username || '?'}
              size={72}
              showStatus={false}
            />
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#4FC3F7" size="small" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.profileName}>
            {user?.display_name || user?.username}
          </Text>
          <Text style={styles.profileStatus}>
            {state.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </Text>
          <TouchableOpacity
            style={styles.photoBtn}
            onPress={handleChangePhoto}
            disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color="#4FC3F7" size="small" />
            ) : (
              <Text style={styles.photoBtnText}>Change Photo</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Error box */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Editable display name */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor="#5E7A8E"
            maxLength={64}
          />
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSaveName}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#E8ECEF" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </TouchableOpacity>
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
  avatarTap: {
    position: 'relative',
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
  photoBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#2B5278',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  photoBtnText: {
    color: '#E8ECEF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#3D1E1E',
    borderWidth: 1,
    borderColor: '#EF5350',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
  },
  errorText: {
    color: '#EF5350',
    fontSize: 13,
  },
  section: {
    backgroundColor: '#17212B',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    color: '#7E93A0',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#1E2C3A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#E8ECEF',
    fontSize: 16,
  },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#2B5278',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#E8ECEF',
    fontSize: 15,
    fontWeight: '600',
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
