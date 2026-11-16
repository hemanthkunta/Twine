import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Message } from '../types';
import StatusTicks from './StatusTicks';

interface Props {
  message: Message;
  isOwn: boolean;
  onReply?: (msg: Message) => void;
}

const DEFAULT_WAVEFORM = [0.4, 0.7, 0.9, 0.5, 0.8, 0.4, 0.9, 0.6, 0.3, 0.7, 0.5, 0.8];

function formatDuration(seconds?: number) {
  if (seconds === undefined || seconds === null || !isFinite(seconds) || seconds < 0) {
    return '';
  }
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins + ':' + secs.toString().padStart(2, '0');
}

function formatFileSize(bytes?: number) {
  if (bytes === undefined || bytes === null || !isFinite(bytes) || bytes < 0) {
    return '';
  }
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function MessageBubble({ message, isOwn, onReply }: Props) {
  const isSystem = message.type === 'SYSTEM';
  const bubbleBg = isOwn ? '#2B5278' : '#182533';
  const align = isOwn ? 'flex-end' : 'flex-start';
  const meta = message.media_metadata;

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

  const duration = formatDuration(meta?.duration);
  const waveform =
    meta?.waveform && meta.waveform.length ? meta.waveform : DEFAULT_WAVEFORM;

  const renderText = () => (
    <Text style={[styles.text, isOwn ? styles.textOwn : styles.textOther]}>
      {message.content_text}
    </Text>
  );

  const renderContent = () => {
    if (message.is_deleted) {
      return <Text style={styles.deletedText}>This message was deleted</Text>;
    }

    switch (message.type) {
      case 'IMAGE':
        if (!message.media_url) return renderText();
        return (
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: message.media_url }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
        );

      case 'VIDEO': {
        if (!message.media_url) return renderText();
        const width = meta?.width || 0;
        const height = meta?.height || 0;
        const aspectStyle = width && height ? { aspectRatio: width / height } : null;
        return (
          <View style={styles.videoWrap}>
            <Image
              source={{ uri: message.media_url }}
              style={[styles.videoThumb, aspectStyle]}
              resizeMode="cover"
            />
            <View style={styles.playOverlay}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
            {duration ? <Text style={styles.videoDuration}>{duration}</Text> : null}
          </View>
        );
      }

      case 'AUDIO':
      case 'VOICE':
        return (
          <View style={styles.audioRow}>
            <View style={styles.audioIcon}>
              <Text style={styles.audioIconText}>♪</Text>
            </View>
            <View style={styles.audioBody}>
              <Text style={styles.audioTitle} numberOfLines={1}>
                {meta?.file_name || 'Audio'}
              </Text>
              <View style={styles.waveform}>
                {waveform.slice(0, 32).map((value, index) => (
                  <View
                    key={index}
                    style={[
                      styles.waveBar,
                      { height: Math.max(3, Math.round(value * 24)) },
                    ]}
                  />
                ))}
              </View>
            </View>
            {duration ? <Text style={styles.audioDuration}>{duration}</Text> : null}
          </View>
        );

      case 'FILE':
        return (
          <View style={styles.fileRow}>
            <View style={styles.fileIcon}>
              <Text style={styles.fileIconText}>📄</Text>
            </View>
            <View style={styles.fileBody}>
              <Text style={styles.fileName} numberOfLines={1}>
                {meta?.file_name || 'Attachment'}
              </Text>
              {formatFileSize(meta?.size) ? (
                <Text style={styles.fileSize}>{formatFileSize(meta?.size)}</Text>
              ) : null}
            </View>
          </View>
        );

      default:
        return renderText();
    }
  };

  return (
    <TouchableOpacity
      onLongPress={() => onReply?.(message)}
      activeOpacity={0.8}
      style={[styles.container, { alignItems: align }]}>
      <View style={[styles.bubble, { backgroundColor: bubbleBg }]}>
        {/* Forwarded provenance header */}
        {message.forwardedFrom && (
          <View style={styles.forwardedHeader}>
            <Text style={styles.forwardedIcon}>↪</Text>
            <Text style={styles.forwardedText} numberOfLines={1}>
              {message.forwardedFrom.senderName
                ? 'Forwarded from ' + message.forwardedFrom.senderName
                : 'Forwarded'}
            </Text>
          </View>
        )}
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
        {renderContent()}
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
  deletedText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#7E93A0',
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
  forwardedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  forwardedIcon: {
    fontSize: 12,
    color: '#7E93A0',
  },
  forwardedText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#7E93A0',
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
  videoWrap: {
    width: 200,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 4,
    backgroundColor: '#15232E',
  },
  videoThumb: {
    width: '100%',
    height: 150,
  },
  playOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -22,
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4FC3F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    fontSize: 18,
    color: '#0E1621',
    marginLeft: 2,
  },
  videoDuration: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    fontSize: 11,
    color: '#E8ECEF',
    backgroundColor: 'rgba(14,22,33,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  audioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    marginBottom: 4,
  },
  audioIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2B5278',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioIconText: {
    fontSize: 16,
    color: '#E8ECEF',
  },
  audioBody: {
    flex: 1,
    marginLeft: 10,
  },
  audioTitle: {
    fontSize: 13,
    color: '#E8ECEF',
    marginBottom: 4,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    gap: 2,
  },
  waveBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: '#4FC3F7',
  },
  audioDuration: {
    fontSize: 11,
    color: '#7E93A0',
    marginLeft: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 200,
    marginBottom: 4,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E2C3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconText: {
    fontSize: 16,
  },
  fileBody: {
    flex: 1,
    marginLeft: 10,
  },
  fileName: {
    fontSize: 14,
    color: '#E8ECEF',
    fontWeight: '500',
  },
  fileSize: {
    fontSize: 11,
    color: '#7E93A0',
    marginTop: 2,
  },
});
