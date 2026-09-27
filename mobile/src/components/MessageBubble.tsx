import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Message } from '../types';
import StatusTicks from './StatusTicks';

interface Props {
  message: Message;
  isOwn: boolean;
  onReply?: (msg: Message) => void;
}

export default function MessageBubble({ message, isOwn, onReply }: Props) {
  const isSystem = message.type === 'SYSTEM';
  const bubbleBg = isOwn ? '#2B5278' : '#182533';
  const align = isOwn ? 'flex-end' : 'flex-start';

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.content_text}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      onLongPress={() => onReply?.(message)}
      activeOpacity={0.8}
      style={[styles.container, { alignItems: align }]}>
      <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
        {/* Reply preview */}
        {message.reply_to_message_id && message.reply_to && (
          <View style={styles.replyBar}>
            <View style={styles.replyLine} />
            <View style={styles.replyContent}>
              <Text style={styles.replyName}>{message.reply_to.sender_name}</Text>
              <Text style={styles.replyText} numberOfLines={1}>
                {message.reply_to.content_text}
              </Text>
            </View>
          </View>
        )}
        {/* Media content */}
        {message.type === 'IMAGE' && message.media_url ? (
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: message.media_url }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
        ) : (
          <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
            {message.content_text}
          </Text>
        )}
        {/* Edited indicator */}
        {message.is_edited && (
          <Text style={styles.edited}>edited</Text>
        )}
        {/* Meta row: time + status ticks */}
        <View style={styles.meta}>
          <Text style={styles.time}>{formatTime(message.created_at)}</Text>
          {isOwn && message.status && <StatusTicks status={message.status} size={11} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 2,
    marginHorizontal: 8,
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  textOwn: {
    color: '#FFFFFF',
  },
  textOther: {
    color: '#E8ECEF',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    gap: 4,
  },
  time: {
    fontSize: 11,
    color: '#7E93A0',
  },
  edited: {
    fontSize: 10,
    color: '#7E93A0',
    fontStyle: 'italic',
    marginTop: 1,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 8,
    paddingHorizontal: 16,
  },
  systemText: {
    fontSize: 13,
    color: '#7E93A0',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  replyBar: {
    flexDirection: 'row',
    marginBottom: 4,
    borderLeftWidth: 2,
    borderLeftColor: '#4FC3F7',
    paddingLeft: 8,
  },
  replyLine: {},
  replyContent: {
    flex: 1,
  },
  replyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4FC3F7',
  },
  replyText: {
    fontSize: 13,
    color: '#7E93A0',
  },
  imageWrap: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
  },
  image: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
});
