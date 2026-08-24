import React, { useState } from 'react';
import { Search, Plus, Shield, LogOut, Users, Radio, Settings, Bot, Sparkles, Download, Heart } from 'lucide-react';
import { Chat, User } from '../types/index';
import { UserAvatar } from './UserAvatar';
import { StatusTicks } from './StatusTicks';
import { StoriesBar } from './StoriesBar';
import { AndroidInstallerService } from '../services/androidInstaller.service';

interface ChatListProps {
  currentUser: User;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  onSwitchAccount: () => void;
  onLogout: () => void;
  onlineUserIds: Set<string>;
  typingUsers: Map<string, string>;
}

export const ChatList: React.FC<ChatListProps> = ({
  currentUser,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onNewGroup,
  onOpenSettings,
  onOpenSearch,
  onSwitchAccount,
  onLogout,
  onlineUserIds,
  typingUsers,
}) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups' | 'channels' | 'unread'>('all');

  const filteredChats = chats.filter((chat) => {
    const title = (chat.peer_user?.display_name || chat.title || '').toLowerCase();
    const matchesSearch = title.includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === 'unread') return (chat.unread_count || 0) > 0;
    if (activeTab === 'direct') return chat.type === 'DIRECT';
    if (activeTab === 'groups') return chat.type === 'GROUP' || chat.type === 'SUPERGROUP';
    if (activeTab === 'channels') return chat.type === 'CHANNEL';

    return true;
  });

  const formatMessageTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <aside className="w-80 md:w-96 flex flex-col h-full bg-[#17212b] border-r border-[rgba(255,255,255,0.06)] select-none">
      {/* Profile Header */}
      <div className="p-3.5 border-b border-[rgba(255,255,255,0.06)] bg-[#17212b] flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <UserAvatar
            name={currentUser.display_name}
            avatarUrl={currentUser.avatar_url}
            size="md"
            isOnline={true}
          />
          <div>
            <div className="text-sm font-bold text-white flex items-center space-x-1">
              <span>{currentUser.display_name}</span>
              <span className="text-[10px] text-[#3fc5f0] px-1.5 py-0.2 bg-[#2f88ff]/15 rounded-full font-semibold">
                You
              </span>
            </div>
            <div className="text-xs text-[#7f91a4]">@{currentUser.username}</div>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-xl text-[#7f91a4] hover:text-[#3fc5f0] hover:bg-[#242f3d] transition-all"
            title="Settings & Preferences"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onSwitchAccount}
            className="p-2 rounded-xl text-[#7f91a4] hover:text-[#3fc5f0] hover:bg-[#242f3d] transition-all"
            title="Switch User Account"
          >
            <Sparkles className="w-4 h-4" />
          </button>
          <button
            onClick={onLogout}
            className="p-2 rounded-xl text-[#7f91a4] hover:text-red-400 hover:bg-[#242f3d] transition-all"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Actions */}
      <div className="p-3 space-y-2.5">
        <div className="flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#7f91a4] absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats, groups, channels..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#0f1822] border border-[rgba(255,255,255,0.06)] rounded-xl text-white text-xs placeholder-[#5e6d7d] focus:border-[#2f88ff] focus:outline-none transition-colors"
            />
          </div>

          <button
            onClick={onNewGroup}
            className="p-2 bg-[#202b36] hover:bg-[#2b3a4a] text-[#3fc5f0] rounded-xl border border-[rgba(255,255,255,0.08)] transition-all"
            title="New Group / Channel"
          >
            <Users className="w-4 h-4" />
          </button>

          <button
            onClick={onNewChat}
            className="p-2 bg-[#2f88ff] hover:bg-[#2575dc] text-white rounded-xl shadow-md shadow-[#2f88ff]/20 transition-transform active:scale-95"
            title="New Direct Message"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex space-x-1 overflow-x-auto pb-0.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'direct', label: 'Direct' },
            { id: 'groups', label: 'Groups' },
            { id: 'channels', label: 'Channels' },
            { id: 'unread', label: 'Unread' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-[#2b5278] text-white shadow-sm'
                  : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Telegram & Instagram Grade Stories Carousel */}
      <StoriesBar currentUser={currentUser} />

      {/* Chat List Feed */}
      <div className="flex-1 overflow-y-auto divide-y divide-[rgba(255,255,255,0.02)]">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <p className="text-xs text-[#7f91a4] mb-2">No conversations found</p>
            <button
              onClick={onNewChat}
              className="text-xs font-medium text-[#3fc5f0] hover:underline"
            >
              Start a new conversation →
            </button>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isSelected = chat.id === activeChatId;
            const isDirect = chat.type === 'DIRECT';
            const isChannel = chat.type === 'CHANNEL';
            const isGroup = chat.type === 'GROUP' || chat.type === 'SUPERGROUP';
            const isSaved = chat.type === 'SAVED' || chat.is_saved_messages;
            const isBot = chat.peer_user?.is_bot;

            const peerName = isSaved
              ? 'Twine Vault (Saved Notes)'
              : isDirect
              ? chat.peer_user?.display_name || chat.title || 'Direct Chat'
              : chat.title || 'Group';

            const peerAvatar = isDirect ? chat.peer_user?.avatar_url || chat.avatar_url : chat.avatar_url;
            const isPeerOnline = isDirect && chat.peer_user ? onlineUserIds.has(chat.peer_user.id) : false;
            const isTyping = typingUsers.has(chat.id);
            const lastMsg = chat.last_message;
            const isMyLastMsg = lastMsg?.sender_id === currentUser.id;

            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={`flex items-center space-x-3 p-3.5 cursor-pointer interactive-card transition-all ${
                  isSelected ? 'bg-[#2b5278]' : 'hover:bg-[#242f3d]'
                }`}
              >
                {isSaved ? (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#ff007f] via-[#ff3366] to-[#b829ea] text-white flex items-center justify-center shadow-lg shadow-[#ff007f]/40 flex-shrink-0 border border-white/20">
                    <Heart className="w-5 h-5 fill-current animate-pulse" />
                  </div>
                ) : (
                  <UserAvatar
                    name={peerName}
                    avatarUrl={peerAvatar}
                    size="md"
                    isOnline={isDirect ? isPeerOnline : undefined}
                  />
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      {isChannel && <Radio className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />}
                      {isGroup && <Users className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
                      {isBot && <Bot className="w-3.5 h-3.5 text-[#3fc5f0] flex-shrink-0" />}

                      <span className="text-sm font-semibold text-white truncate">
                        {peerName}
                      </span>
                      {chat.is_e2ee && (
                        <span title="E2EE Encrypted">
                          <Shield className="w-3 h-3 text-[#3fc5f0] flex-shrink-0" />
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-[#7f91a4] flex-shrink-0 ml-1">
                      {formatMessageTime(lastMsg?.created_at || chat.updated_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[#7f91a4] truncate flex items-center space-x-1 mr-2">
                      {isTyping ? (
                        <span className="text-[#3fc5f0] font-medium">
                          {typingUsers.get(chat.id)} is typing...
                        </span>
                      ) : (
                        <>
                          {isMyLastMsg && lastMsg && (
                            <StatusTicks status={lastMsg.status} className="mr-0.5" />
                          )}
                          <span className="truncate">
                            {lastMsg?.content_text || (lastMsg?.type === 'VOICE' ? '🎙️ Voice message' : lastMsg?.type === 'IMAGE' ? '📷 Photo' : 'No messages yet')}
                          </span>
                        </>
                      )}
                    </div>

                    {Boolean(chat.unread_count && chat.unread_count > 0) && (
                      <span className="px-1.5 py-0.5 bg-[#2f88ff] text-white text-[10px] font-bold rounded-full min-w-[18px] text-center shadow-sm">
                        {chat.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
