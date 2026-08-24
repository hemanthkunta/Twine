import React, { useState, useEffect } from 'react';
import { MessageSquare, X, Send, CornerDownRight, Sparkles, Check } from 'lucide-react';
import { Message, User } from '../types/index';
import { ApiService } from '../services/api';
import { UserAvatar } from './UserAvatar';

interface ThreadModalProps {
  parentMessage: Message;
  currentUser: User;
  onClose: () => void;
  onSendReply: (text: string, parentId: string) => void;
}

export const ThreadModal: React.FC<ThreadModalProps> = ({
  parentMessage,
  currentUser,
  onClose,
  onSendReply,
}) => {
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiService.getThreadMessages(parentMessage.id)
      .then((res) => {
        setThreadMessages(res.messages);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [parentMessage.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    onSendReply(replyText.trim(), parentMessage.id);

    const localReply: Message = {
      id: `local_thread_${Date.now()}`,
      chat_id: parentMessage.chat_id,
      sender_id: currentUser.id,
      reply_to_message_id: parentMessage.id,
      content_text: replyText.trim(),
      type: 'TEXT',
      is_edited: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      status: 'SENT',
      sender: {
        id: currentUser.id,
        username: currentUser.username,
        display_name: currentUser.display_name,
        avatar_url: currentUser.avatar_url,
      },
    };

    setThreadMessages((prev) => [...prev, localReply]);
    setReplyText('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-lg h-full glass-modal bg-[#111923] border-l border-[rgba(255,255,255,0.08)] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="h-16 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#2f88ff]/15 border border-[#2f88ff]/30 text-[#3fc5f0]">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Thread Replies</h3>
              <p className="text-[11px] text-[#7f91a4]">{threadMessages.length} replies</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thread Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Root Parent Message Card */}
          <div className="p-3.5 rounded-2xl bg-[#17212b] border border-[rgba(255,255,255,0.08)] shadow-sm space-y-2">
            <div className="flex items-center space-x-2">
              <UserAvatar
                name={parentMessage.sender?.display_name || 'User'}
                avatarUrl={parentMessage.sender?.avatar_url}
                size="sm"
              />
              <div>
                <div className="text-xs font-bold text-white">
                  {parentMessage.sender?.display_name || 'User'}
                </div>
                <div className="text-[10px] text-[#7f91a4]">
                  {new Date(parentMessage.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>

            <p className="text-xs text-white/90 leading-relaxed pl-8">
              {parentMessage.content_text}
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs text-[#7f91a4] px-2">
            <CornerDownRight className="w-4 h-4 text-[#3fc5f0]" />
            <span className="font-semibold uppercase tracking-wider text-[10px]">Replies in Thread</span>
          </div>

          {/* Reply Messages */}
          {loading ? (
            <div className="py-12 text-center text-xs text-[#7f91a4]">Loading thread discussion...</div>
          ) : threadMessages.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#7f91a4]">
              No replies yet. Be the first to start the thread discussion!
            </div>
          ) : (
            threadMessages.map((msg) => (
              <div key={msg.id} className="flex items-start space-x-2.5 pl-2">
                <UserAvatar
                  name={msg.sender?.display_name || 'User'}
                  avatarUrl={msg.sender?.avatar_url}
                  size="sm"
                />
                <div className="flex-1 p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#3fc5f0]">
                      {msg.sender?.display_name || 'User'}
                    </span>
                    <span className="text-[10px] text-[#7f91a4]">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-white/90 leading-relaxed">{msg.content_text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSubmit}
          className="p-4 bg-[#17212b] border-t border-[rgba(255,255,255,0.06)] flex items-center space-x-2 flex-shrink-0"
        >
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply to thread..."
            className="flex-1 px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!replyText.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] text-white disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
