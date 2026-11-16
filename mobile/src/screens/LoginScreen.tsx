import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { StatusBar } from 'expo-status-bar';

const DEMO_ACCOUNTS = ['alice', 'bob', 'charlie', 'diana'];

export default function LoginScreen() {
  const { loginDemo, login, submitTwoFactorCode } = useApp();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');

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

  const handleLogin = async () => {
    if (!identifier.trim() || !password) {
      setError('Enter your username or phone number and your password');
      return;
    }
    try {
      setLoading('login');
      setError(null);
      const prompt = await login(identifier.trim(), password);
      if (prompt) {
        setChallengeId(prompt.challengeId);
      }
    } catch (e: any) {
      setError(e.message || 'Login failed');
    } finally {
      setLoading(null);
    }
  };

  const handleTwoFactor = async () => {
    if (!challengeId || !code.trim()) {
      setError('Enter the code from your authenticator app');
      return;
    }
    try {
      setLoading('2fa');
      setError(null);
      await submitTwoFactorCode(challengeId, code.trim());
      setChallengeId(null);
      setCode('');
    } catch (e: any) {
      setError(e.message || 'Two-factor verification failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.logo}>✈</Text>
        <Text style={styles.appName}>Telegram Clone</Text>
        <Text style={styles.tagline}>Real-time messaging platform</Text>
      </View>

      {challengeId ? (
        <View style={styles.demoSection}>
          <Text style={styles.sectionTitle}>Two-factor authentication</Text>
          <Text style={styles.sectionSubtitle}>
            Enter the 6-digit code (or a backup code) to finish signing in
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Authentication code"
            placeholderTextColor="#5A7388"
            value={code}
            onChangeText={setCode}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleTwoFactor}
            disabled={loading !== null}>
            {loading === '2fa' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Verify</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
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
      )}

      {!challengeId && (
        <View style={styles.demoSection}>
          <Text style={styles.sectionTitle}>Sign in</Text>
          <Text style={styles.sectionSubtitle}>
            Use your username or phone number
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Username or phone number"
            placeholderTextColor="#5A7388"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#5A7388"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleLogin}
            disabled={loading !== null}>
            {loading === 'login' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </ScrollView>
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
  },
  content: {
    flexGrow: 1,
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
    marginBottom: 20,
    textAlign: 'center',
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
    backgroundColor: '#4ECDC4',
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
  input: {
    backgroundColor: '#1E2C3A',
    borderRadius: 10,
    color: '#E8ECEF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: '#2B5278',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
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
