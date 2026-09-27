import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ReceiptStatus } from '../types';

interface Props {
  status: ReceiptStatus;
  size?: number;
}

export default function StatusTicks({ status, size = 14 }: Props) {
  const color =
    status === 'READ'
      ? '#4FC3F7'
      : status === 'DELIVERED'
        ? '#B0BEC5'
        : status === 'SENT' || status === 'QUEUED'
          ? '#B0BEC5'
          : '#EF5350';

  return (
    <View style={styles.container}>
      <Text style={[styles.ticks, { color, fontSize: size }]}>
        {status === 'READ' || status === 'DELIVERED'
          ? '✓✓'
          : status === 'FAILED'
            ? '✗'
            : status === 'QUEUED'
              ? '⏳'
              : '✓'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticks: {
    fontWeight: '600',
  },
});
