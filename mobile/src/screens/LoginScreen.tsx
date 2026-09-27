import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useApp } from '../context/AppContext';
import { StatusBar } from 'expo-status-bar';

const DEMO_ACCOUNTS = ['alice', 'bob', 'charlie', 'diana'];

export default function LoginScreen() {
  const { loginDemo } = useApp();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDemoLogin = async (account: string) => {
    try {
      setLoading(account);
      setError(null);
      await loginDemo(account);
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.logo}>✈</Text>
        <Text style={styles.appName}>Telegram Clone</Text>
        <Text style={styles.tagline}>Real-time messaging platform</Text>
      </View>

      <View style={styles.demoSection}>
        <Text style={styles.sectionTitle}>Quick Demo Login</Text>
        <Text style={styles.sectionSubtitle}>
          Select a demo account to get started instantly
        </Text>
        <View style={styles.accountGrid}>
          {DEMO_ACCOUNTS.map((name) => (
            <TouchableOpacity
              key={name}
              style={styles.accountBtn}
              onPress={() => handleDemoLogin(name)}
              disabled={loading !== null}>
              {loading === name ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <View style={[styles.avatar, { backgroundColor: getColor(name) }]}>
                    <Text style={styles.avatarText}>{name[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.accountName}>
                    {name.charAt(0).toUpperCase() + name.slice(1)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

function getColor(name: string): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
  const idx = ['alice', 'bob', 'charlie', 'diana'].indexOf(name.toLowerCase());
  return colors[idx >= 0 ? idx : 0];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E1621',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 64,
    marginBottom: 12,
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#E8ECEF',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: '#7E93A0',
  },
  demoSection: {
    backgroundColor: '#17212B',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E8ECEF',
    marginBottom: 4,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#7E93A0',
    textAlign: 'center',
    marginBottom: 20,
  },
  accountGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  accountBtn: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1E2C3A',
    width: 72,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  accountName: {
    color: '#E8ECEF',
    fontSize: 13,
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: '#3D1E1E',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#EF5350',
    fontSize: 14,
    textAlign: 'center',
  },
});
