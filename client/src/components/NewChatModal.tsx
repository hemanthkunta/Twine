import React, { useState, useEffect } from 'react';
import { Search, X, MessageSquarePlus, User as UserIcon } from 'lucide-react';
import { UserSummary } from '../types/index';
import { ApiService } from '../services/api';
import { UserAvatar } from './UserAvatar';

interface NewChatModalProps {
  onClose: () => void;
  onSelectUser: (userId: string) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ onClose, onSelectUser }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      ApiService.searchUsers(query)
        .then((res) => setResults(res.users))
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md glass-modal rounded-2xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.1)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[#17212b]">
          <div className="flex items-center space-x-2.5">
            <MessageSquarePlus className="w-5 h-5 text-[#3fc5f0]" />
            <h3 className="text-base font-semibold text-white">Start New Conversation</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar */}
        <div className="p-4 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)]">
          <div className="relative">
            <Search className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, @username or phone..."
              className="w-full pl-10 pr-4 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-sm focus:border-[#2f88ff] focus:outline-none"
            />
          </div>
        </div>

        {/* User list */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-[rgba(255,255,255,0.03)]">
          {loading ? (
            <div className="py-8 text-center text-xs text-[#7f91a4]">Searching users...</div>
          ) : results.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#7f91a4]">
              No matching users found. Try searching another name or @username.
            </div>
          ) : (
            results.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onSelectUser(user.id);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#242f3d] transition-all text-left group"
              >
                <div className="flex items-center space-x-3">
                  <UserAvatar name={user.display_name} avatarUrl={user.avatar_url} size="md" isOnline={user.is_online} />
                  <div>
                    <div className="text-sm font-semibold text-white group-hover:text-[#3fc5f0] transition-colors">
                      {user.display_name}
                    </div>
                    <div className="text-xs text-[#7f91a4]">@{user.username}</div>
                  </div>
                </div>
                <span className="text-xs font-medium text-[#2f88ff] group-hover:underline">
                  Message
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
