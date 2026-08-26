import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  Video,
  Search,
  MoreVertical,
  ShieldCheck,
  ArrowLeft,
  Radio,
  Users,
  Bot,
  Compass,
  Flame,
  BarChart3,
  Network,
  Heart,
  Ban,
  UserCheck,
  Bell,
  BellOff,
  Trash2,
} from 'lucide-react';
import { Chat, TransportMode } from '../types/index';
import { UserAvatar } from './UserAvatar';
import { UserStatusBadge } from './UserStatusBadge';

interface ChatHeaderProps {
  chat: Chat;
  isOnline?: boolean;
  isTyping?: boolean;
  isBlocked?: boolean;
  isMuted?: boolean;
  transportMode?: TransportMode;
  meshPeerCount?: number;
  disappearingTimer?: number;
  suggestedTopics?: string[];
  onBackMobile?: () => void;
  onStartCall: (type: 'voice' | 'video') => void;
  onOpenSearch: () => void;
  onOpenMeshRadar: () => void;
  onOpenSafetyNumber: () => void;
  onOpenDisappearingTimer: () => void;
  onOpenAIModeration?: () => void;
  onOpenCreatePoll?: () => void;
  onOpenChannelDashboard?: () => void;
  onOpenFederationBridge?: () => void;
  onToggleBlock?: () => void;
  onToggleMute?: () => void;
  onClearChat?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chat,
  isOnline,
  isTyping,
  isBlocked = false,
  isMuted = false,
  transportMode = 'CLOUD',
  meshPeerCount = 3,
  disappearingTimer = 0,
  suggestedTopics = ['#WebRTC', '#Security', '#MeshRelay'],
  onBackMobile,
  onStartCall,
  onOpenSearch,
  onOpenMeshRadar,
  onOpenSafetyNumber,
  onOpenDisappearingTimer,
  onOpenAIModeration,
  onOpenCreatePoll,
  onOpenChannelDashboard,
  onOpenFederationBridge,
  onToggleBlock,
  onToggleMute,
  onClearChat,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isSaved = Boolean(chat.type === 'SAVED' || chat.is_saved_messages || chat.title?.includes('Saved Notes') || chat.title?.includes('Twine Vault'));
  const isDirect = (chat.type === 'DIRECT' || Boolean(chat.peer_user)) && !isSaved;
  const isChannel = chat.type === 'CHANNEL';
  const isGroup = (chat.type === 'GROUP' || chat.type === 'SUPERGROUP') && !isDirect && !isSaved;
  const isBot = Boolean(chat.peer_user?.is_bot);

  const peerName = isSaved
    ? 'Twine Vault (Saved Notes)'
    : isDirect
    ? chat.peer_user?.display_name || chat.title || 'Direct Chat'
    : chat.title || 'Group';

  const peerAvatar = isDirect ? chat.peer_user?.avatar_url || chat.avatar_url : chat.avatar_url;
  const lastSeen = chat.peer_user?.last_seen_at;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 px-3 sm:px-4 border-b border-theme bg-theme-header flex items-center justify-between flex-shrink-0 sticky top-0 z-20 select-none shadow-sm min-w-0">
      {/* Left: Back Button & User Info */}
      <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1 mr-2">
        {onBackMobile && (
          <button
            onClick={onBackMobile}
            className="md:hidden p-2 -ml-1 rounded-xl text-[#7f91a4] hover:text-white hover:bg-[#202b36] transition-colors flex-shrink-0"
            title="Back to Chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {isSaved ? (
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#ff007f] via-[#ff3366] to-[#b829ea] text-white flex items-center justify-center shadow-lg shadow-[#ff007f]/40 flex-shrink-0 border border-white/20">
            <Heart className="w-5 h-5 fill-current animate-pulse" />
          </div>
        ) : (
          <UserAvatar
            name={peerName}
            avatarUrl={peerAvatar}
            size="md"
            isOnline={isDirect && !isBlocked ? isOnline : undefined}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-1.5 min-w-0">
            {isChannel && <Radio className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />}
            {isGroup && <Users className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />}
            {isBot && <Bot className="w-3.5 h-3.5 text-[#3fc5f0] flex-shrink-0" />}

            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate leading-tight">
              {peerName}
            </h2>

            {isBlocked && (
              <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-bold flex-shrink-0">
                <Ban className="w-3 h-3" />
                <span>Blocked</span>
              </span>
            )}

            {isDirect && !isBlocked && (
              <span className="hidden sm:inline-flex items-center space-x-1 px-1.5 py-0.2 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold flex-shrink-0">
                <ShieldCheck className="w-3 h-3" />
                <span className="hidden md:inline">E2EE</span>
              </span>
            )}

            {isMuted && (
              <span className="text-[#7f91a4]" title="Notifications Muted">
                <BellOff className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 text-xs min-w-0">
            {isBlocked ? (
              <span className="text-xs text-red-400 font-medium truncate">You blocked this contact</span>
            ) : isDirect ? (
              <UserStatusBadge
                isOnline={Boolean(isOnline)}
                isTyping={Boolean(isTyping)}
                lastSeenAt={lastSeen}
              />
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-[#7f91a4] truncate">
                <span>
                  {isChannel
                    ? `${chat.member_count || 4} subscribers`
                    : `${chat.member_count || 5} members`}
                </span>
                <span className="text-[10px] text-[#5e6d7d] hidden lg:inline">•</span>
                <div className="hidden lg:flex items-center space-x-1">
                  {suggestedTopics.map((t) => (
                    <span
                      key={t}
                      className="text-[10px] text-cyan-400 font-medium hover:underline cursor-pointer"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-0.5 sm:space-x-1 text-[#7f91a4] flex-shrink-0">
        {/* Desktop Quick Actions */}
        {(isGroup || isChannel) && onOpenCreatePoll && (
          <button
            onClick={onOpenCreatePoll}
            className="hidden lg:flex p-2 rounded-xl hover:text-[#3fc5f0] hover:bg-[#202b36] transition-all"
            title="Create Poll or Quiz"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        )}

        {isChannel && onOpenChannelDashboard && (
          <button
            onClick={onOpenChannelDashboard}
            className="hidden lg:flex p-2 rounded-xl hover:text-purple-400 hover:bg-[#202b36] transition-all"
            title="Channel Analytics & Admin Dashboard"
          >
            <Radio className="w-4 h-4" />
          </button>
        )}

        {(isGroup || isChannel) && onOpenFederationBridge && (
          <button
            onClick={onOpenFederationBridge}
            className="hidden lg:flex p-2 rounded-xl hover:text-cyan-400 hover:bg-[#202b36] transition-all"
            title="Matrix / XMPP Federation Bridge"
          >
            <Network className="w-4 h-4" />
          </button>
        )}

        {(isGroup || isChannel) && onOpenAIModeration && (
          <button
            onClick={onOpenAIModeration}
            className="hidden md:flex p-2 rounded-xl text-purple-400 hover:bg-[#202b36] hover:text-purple-300 transition-all"
            title="Configure AI Moderation Bot"
          >
            <Bot className="w-4 h-4" />
          </button>
        )}

        {/* Disappearing Messages Trigger */}
        <button
          onClick={onOpenDisappearingTimer}
          className={`hidden sm:flex p-2 rounded-xl transition-all ${
            disappearingTimer > 0
              ? 'text-orange-400 bg-orange-500/10 hover:bg-orange-500/20'
              : 'hover:text-orange-400 hover:bg-[#202b36]'
          }`}
          title="Disappearing Messages Timer"
        >
          <Flame className="w-4 h-4" />
        </button>

        {/* Safety Number E2EE Trigger */}
        {isDirect && !isBlocked && (
          <button
            onClick={onOpenSafetyNumber}
            className="hidden sm:flex p-2 rounded-xl hover:text-emerald-400 hover:bg-[#202b36] transition-all"
            title="Verify Safety Number & QR Code"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>
        )}

        {/* Mesh Radar Trigger */}
        <button
          onClick={onOpenMeshRadar}
          className="hidden sm:flex p-2 rounded-xl text-purple-400 hover:bg-[#202b36] hover:text-purple-300 transition-all"
          title="P2P Mesh Radar & BLE Discovery"
        >
          <Compass className="w-4 h-4" />
        </button>

        {/* Voice & Video Call Buttons (Disabled if contact is blocked) */}
        {isDirect && !isBot && (
          <>
            <button
              disabled={isBlocked}
              onClick={() => onStartCall('voice')}
              className={`p-2 sm:p-2.5 rounded-xl transition-all ${
                isBlocked
                  ? 'text-gray-600 opacity-40 cursor-not-allowed'
                  : 'text-[#3fc5f0] hover:text-white hover:bg-[#202b36]'
              }`}
              title={isBlocked ? 'Contact is blocked' : 'Voice Call (WebRTC)'}
            >
              <Phone className="w-4 h-4" />
            </button>

            <button
              disabled={isBlocked}
              onClick={() => onStartCall('video')}
              className={`p-2 sm:p-2.5 rounded-xl transition-all ${
                isBlocked
                  ? 'text-gray-600 opacity-40 cursor-not-allowed'
                  : 'text-[#3fc5f0] hover:text-white hover:bg-[#202b36]'
              }`}
              title={isBlocked ? 'Contact is blocked' : 'Video Call (WebRTC)'}
            >
              <Video className="w-4 h-4" />
            </button>
          </>
        )}

        {/* Search */}
        <button
          onClick={onOpenSearch}
          className="p-2 sm:p-2.5 rounded-xl hover:text-white hover:bg-[#202b36] transition-all"
          title="Search messages"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Responsive 3-Dots More Options Dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMoreMenu((prev) => !prev)}
            className={`p-2 sm:p-2.5 rounded-xl transition-all ${
              showMoreMenu ? 'text-white bg-[#2b5278]' : 'hover:text-white hover:bg-[#202b36]'
            }`}
            title="More options (Search, Block, Clear, E2EE)"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-60 glass-modal rounded-2xl p-1.5 border border-white/15 shadow-2xl z-50 animate-fade-in flex flex-col space-y-0.5">
              {/* 1. Search */}
              <button
                onClick={() => { onOpenSearch(); setShowMoreMenu(false); }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
              >
                <Search className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Search in Conversation</span>
              </button>

              {/* 2. Block / Unblock Contact (For Direct Chats) */}
              {isDirect && chat.peer_user && onToggleBlock && (
                <button
                  onClick={() => { onToggleBlock(); setShowMoreMenu(false); }}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2 text-xs rounded-xl transition-colors text-left font-semibold ${
                    isBlocked
                      ? 'text-emerald-400 hover:bg-emerald-500/20'
                      : 'text-red-400 hover:bg-red-500/20'
                  }`}
                >
                  {isBlocked ? (
                    <>
                      <UserCheck className="w-4 h-4 flex-shrink-0" />
                      <span>Unblock {chat.peer_user.display_name}</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4 flex-shrink-0" />
                      <span>Block {chat.peer_user.display_name}</span>
                    </>
                  )}
                </button>
              )}

              {/* 3. Mute / Unmute Notifications */}
              {onToggleMute && (
                <button
                  onClick={() => { onToggleMute(); setShowMoreMenu(false); }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                >
                  {isMuted ? (
                    <>
                      <Bell className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                      <span>Unmute Notifications</span>
                    </>
                  ) : (
                    <>
                      <BellOff className="w-4 h-4 text-[#7f91a4] flex-shrink-0" />
                      <span>Mute Notifications</span>
                    </>
                  )}
                </button>
              )}

              {/* 4. Disappearing Messages */}
              <button
                onClick={() => { onOpenDisappearingTimer(); setShowMoreMenu(false); }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
              >
                <Flame className="w-4 h-4 text-orange-400 flex-shrink-0" />
                <span>Disappearing Messages</span>
              </button>

              {/* 5. Safety Number (E2EE) */}
              {isDirect && (
                <button
                  onClick={() => { onOpenSafetyNumber(); setShowMoreMenu(false); }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span>Verify E2EE Safety Number</span>
                </button>
              )}

              {/* 6. Mesh Radar */}
              <button
                onClick={() => { onOpenMeshRadar(); setShowMoreMenu(false); }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
              >
                <Compass className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>P2P Mesh Radar</span>
              </button>

              {/* 7. Clear Chat History */}
              {onClearChat && (
                <button
                  onClick={() => { onClearChat(); setShowMoreMenu(false); }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-red-300 hover:bg-red-500/15 rounded-xl transition-colors text-left border-t border-white/5 pt-2 mt-1"
                >
                  <Trash2 className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <span>Clear Conversation History</span>
                </button>
              )}

              {/* 8. Group/Channel Actions */}
              {(isGroup || isChannel) && onOpenCreatePoll && (
                <button
                  onClick={() => { onOpenCreatePoll(); setShowMoreMenu(false); }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                >
                  <BarChart3 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span>Create Poll or Quiz</span>
                </button>
              )}

              {isChannel && onOpenChannelDashboard && (
                <button
                  onClick={() => { onOpenChannelDashboard(); setShowMoreMenu(false); }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                >
                  <Radio className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span>Channel Analytics</span>
                </button>
              )}

              {(isGroup || isChannel) && onOpenFederationBridge && (
                <button
                  onClick={() => { onOpenFederationBridge(); setShowMoreMenu(false); }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                >
                  <Network className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span>Bridge to Matrix / XMPP</span>
                </button>
              )}

              {(isGroup || isChannel) && onOpenAIModeration && (
                <button
                  onClick={() => { onOpenAIModeration(); setShowMoreMenu(false); }}
                  className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs text-white hover:bg-[#2b5278] rounded-xl transition-colors text-left"
                >
                  <Bot className="w-4 h-4 text-[#3fc5f0] flex-shrink-0" />
                  <span>AI Moderation Bot</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
