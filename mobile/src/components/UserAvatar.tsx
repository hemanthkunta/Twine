import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

interface Props {
  uri?: string;
  name: string;
  size?: number;
  isOnline?: boolean;
  showStatus?: boolean;
}

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function UserAvatar({ uri, name, size = 48, isOnline, showStatus = true }: Props) {
  const initials = name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const bgColor = getColor(name);
  const ringColor = isOnline ? '#31C48D' : undefined;

  return (
    <View style={[styles.wrapper, { width: size + 4, height: size + 4 }]}>
      <View
        style={[
          styles.container,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bgColor,
            borderColor: ringColor || 'transparent',
            borderWidth: ringColor ? 2 : 0,
          },
        ]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
        )}
      </View>
      {showStatus && isOnline !== undefined && (
        <View
          style={[
            styles.dot,
            {
              backgroundColor: isOnline ? '#31C48D' : '#9CA3AF',
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: (size * 0.28) / 2,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
  },
  dot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: '#17212B',
  },
});
