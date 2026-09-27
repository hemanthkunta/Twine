import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface Props {
  onSend: (text: string) => void;
  onSendImage?: () => Promise<void>;
  onTyping?: () => void;
  placeholder?: string;
}

export default function MessageInput({ onSend, onSendImage, onTyping, placeholder = 'Message...' }: Props) {
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleSendImage = async () => {
    if (uploading || !onSendImage) return;
    setUploading(true);
    try {
      await onSendImage();
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.attachBtn}
        onPress={handleSendImage}
        disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color="#4FC3F7" size="small" />
        ) : (
          <Text style={styles.attachIcon}>📎</Text>
        )}
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={(val) => {
          setText(val);
          onTyping?.();
        }}
        placeholder={placeholder}
        placeholderTextColor="#5E7A8E"
        multiline
        maxLength={4096}
      />
      {text.trim().length > 0 && (
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#1E2C3A',
    borderTopWidth: 1,
    borderTopColor: '#2A3A4A',
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#15232E',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  attachIcon: {
    fontSize: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#15232E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#E8ECEF',
    fontSize: 16,
    maxHeight: 100,
  },
  sendBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2B5278',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
