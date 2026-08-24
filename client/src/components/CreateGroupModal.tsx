import React, { useState, useEffect } from 'react';
import { Users, Radio, X, Check, Shield, Sparkles } from 'lucide-react';
import { UserSummary } from '../types/index';
import { ApiService } from '../services/api';
import { UserAvatar } from './UserAvatar';

interface CreateGroupModalProps {
  onClose: () => void;
  onCreated: (chat: any) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ onClose, onCreated }) => {
  const [chatType, setChatType] = useState<'SUPERGROUP' | 'CHANNEL'>('SUPERGROUP');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserSummary[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ApiService.searchUsers('')
      .then((res) => setAvailableUsers(res.users))
      .catch((err) => console.error(err));
  }, []);

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a group or channel name');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.createGroup({
        title: title.trim(),
        description: description.trim(),
        type: chatType,
        memberIds: Array.from(selectedUserIds),
      });
      onCreated(res.chat);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[#17212b]">
          <div className="flex items-center space-x-2.5">
            {chatType === 'CHANNEL' ? (
              <Radio className="w-5 h-5 text-[#3fc5f0]" />
            ) : (
              <Users className="w-5 h-5 text-[#3fc5f0]" />
            )}
            <h3 className="text-base font-bold text-white">
              {chatType === 'CHANNEL' ? 'Create New Broadcast Channel' : 'Create Supergroup'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs">
              {error}
            </div>
          )}

          {/* Type Selector */}
          <div className="flex bg-[#0f1822] p-1 rounded-xl border border-[rgba(255,255,255,0.06)]">
            <button
              type="button"
              onClick={() => setChatType('SUPERGROUP')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                chatType === 'SUPERGROUP'
                  ? 'bg-[#2b5278] text-white shadow'
                  : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Supergroup (Everyone Chats)</span>
            </button>
            <button
              type="button"
              onClick={() => setChatType('CHANNEL')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                chatType === 'CHANNEL'
                  ? 'bg-[#2b5278] text-white shadow'
                  : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Channel (Broadcast Only)</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7f91a4] mb-1">
              {chatType === 'CHANNEL' ? 'Channel Name' : 'Group Name'}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={chatType === 'CHANNEL' ? 'e.g. 📢 Tech Trends & Announcements' : 'e.g. 🚀 Core Dev Team'}
              className="w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#7f91a4] mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group or channel about?"
              className="w-full px-3.5 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff] resize-none"
            />
          </div>

          {/* Member Picker */}
          <div>
            <label className="block text-xs font-medium text-[#7f91a4] mb-2">
              Add Members ({selectedUserIds.size} selected)
            </label>
            <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-[#0f1822] rounded-xl border border-[rgba(255,255,255,0.06)] divide-y divide-[rgba(255,255,255,0.03)]">
              {availableUsers.map((user) => {
                const isSelected = selectedUserIds.has(user.id);
                return (
                  <div
                    key={user.id}
                    onClick={() => toggleUser(user.id)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[#1a2634] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <UserAvatar name={user.display_name} avatarUrl={user.avatar_url} size="sm" isOnline={user.is_online} />
                      <div>
                        <div className="text-xs font-semibold text-white">{user.display_name}</div>
                        <div className="text-[10px] text-[#7f91a4]">@{user.username}</div>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                        isSelected
                          ? 'bg-[#2f88ff] border-[#2f88ff] text-white'
                          : 'border-[rgba(255,255,255,0.2)] bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 font-semibold text-white rounded-xl text-sm shadow-lg shadow-[#2f88ff]/20 transition-all"
          >
            {loading ? 'Creating...' : `Create ${chatType === 'CHANNEL' ? 'Channel' : 'Supergroup'}`}
          </button>
        </form>
      </div>
    </div>
  );
};
