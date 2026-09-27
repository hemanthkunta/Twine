import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  name: string;
}

export default function TypingIndicator({ name }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        <View style={[styles.dot, styles.dot1]} />
        <View style={[styles.dot, styles.dot2]} />
        <View style={[styles.dot, styles.dot3]} />
      </View>
      <Text style={styles.text}>{name} is typing...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dots: {
    flexDirection: 'row',
    marginRight: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7E93A0',
    marginHorizontal: 1.5,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
  text: {
    color: '#7E93A0',
    fontSize: 13,
    fontStyle: 'italic',
  },
});
