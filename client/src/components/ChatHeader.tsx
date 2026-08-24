import React from 'react';
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
  Cloud,
  Compass,
  Flame,
  BarChart3,
  Network,
  Bookmark,
  Heart,
} from 'lucide-react';
import { Chat, TransportMode } from '../types/index';
import { UserAvatar } from './UserAvatar';
import { UserStatusBadge } from './UserStatusBadge';
import { disappearingService } from '../services/disappearing.service';

interface ChatHeaderProps {
  chat: Chat;
  isOnline?: boolean;
  isTyping?: boolean;
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
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chat,
  isOnline,
  isTyping,
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
}) => {
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
  const lastSeen = chat.peer_user?.last_seen_at;

  return (
    <header className="h-16 px-4 border-b border-[rgba(255,255,255,0.06)] bg-[#17212b] flex items-center justify-between z-10 select-none shadow-sm">
      <div className="flex items-center space-x-3 min-w-0">
        {onBackMobile && (
          <button
            onClick={onBackMobile}
            className="md:hidden p-1.5 rounded-lg text-[#7f91a4] hover:text-white"
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
            isOnline={isDirect ? isOnline : undefined}
          />
        )}

        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm md:text-base font-bold text-white truncate">{peerName}</h2>

            {/* Transport & Connection State Pill */}
            {transportMode === 'CLOUD' ? (
              <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/25">
                <Cloud className="w-3 h-3" />
                <span className="hidden sm:inline">Cloud Sync</span>
              </span>
            ) : transportMode === 'MESH' ? (
              <button
                onClick={onOpenMeshRadar}
                className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/35 hover:bg-purple-500/30 transition-all animate-pulse"
                title="Active BLE / LoRa Mesh Fallback"
              >
                <Compass className="w-3 h-3" />
                <span>Mesh ({meshPeerCount} peers)</span>
              </button>
            ) : (
              <span className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/25">
                <span>⏳ Offline Queued</span>
              </span>
            )}

            {/* Disappearing Timer Badge if active */}
            {disappearingTimer > 0 && (
              <button
                onClick={onOpenDisappearingTimer}
                className="inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-semibold border border-orange-500/30 hover:bg-orange-500/30 transition-all"
                title="Disappearing messages timer active"
              >
                <Flame className="w-3 h-3 text-orange-400 animate-pulse" />
                <span>{disappearingService.formatTimerLabel(disappearingTimer as any)}</span>
              </button>
            )}

            {isDirect && isBot && (
              <span className="inline-flex items-center space-x-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[#3fc5f0]/15 text-[#3fc5f0] font-medium border border-[#3fc5f0]/30">
                <Bot className="w-3 h-3" />
                <span>AI</span>
              </span>
            )}

            {isChannel && (
              <span className="inline-flex items-center space-x-0.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium border border-purple-500/30">
                <Radio className="w-3 h-3" />
                <span>Channel</span>
              </span>
            )}

            {isGroup && (
              <span className="inline-flex items-center space-x-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 font-medium border border-blue-500/30">
                <Users className="w-3 h-3" />
                <span>{chat.member_count || 5} members</span>
              </span>
            )}

            {chat.is_e2ee && (
              <button
                onClick={onOpenSafetyNumber}
                className="inline-flex items-center space-x-0.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                title="Click to verify 60-digit E2EE Safety Number"
              >
                <ShieldCheck className="w-3 h-3" />
                <span className="hidden sm:inline">E2EE</span>
              </button>
            )}
          </div>

          {/* Subtitle / Presence / Topic Chips */}
          <div className="flex items-center space-x-2">
            {isSaved ? (
              <span className="text-xs text-[#7f91a4]">Your personal cloud storage & notes</span>
            ) : isDirect ? (
              <UserStatusBadge isOnline={isOnline} lastSeenAt={lastSeen} isTyping={isTyping} />
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-[#7f91a4]">
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

      {/* Actions */}
      <div className="flex items-center space-x-1 sm:space-x-1.5 text-[#7f91a4]">
        {/* Create Poll / Quiz Trigger */}
        {(isGroup || isChannel) && onOpenCreatePoll && (
          <button
            onClick={onOpenCreatePoll}
            className="p-2.5 rounded-xl hover:text-[#3fc5f0] hover:bg-[#242f3d] transition-all"
            title="Create Poll or Quiz"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
        )}

        {/* Channel Analytics Dashboard Trigger */}
        {isChannel && onOpenChannelDashboard && (
          <button
            onClick={onOpenChannelDashboard}
            className="p-2.5 rounded-xl hover:text-purple-400 hover:bg-[#242f3d] transition-all"
            title="Channel Analytics & Admin Dashboard"
          >
            <Radio className="w-4 h-4" />
          </button>
        )}

        {/* Matrix / XMPP Federation Bridge Trigger */}
        {(isGroup || isChannel) && onOpenFederationBridge && (
          <button
            onClick={onOpenFederationBridge}
            className="p-2.5 rounded-xl hover:text-cyan-400 hover:bg-[#242f3d] transition-all"
            title="Matrix / XMPP Federation Bridge"
          >
            <Network className="w-4 h-4" />
          </button>
        )}

        {/* AI Moderation Bot Trigger */}
        {(isGroup || isChannel) && onOpenAIModeration && (
          <button
            onClick={onOpenAIModeration}
            className="p-2.5 rounded-xl text-purple-400 hover:bg-[#242f3d] hover:text-purple-300 transition-all"
            title="Configure AI Moderation Bot (Spam & Toxicity Filter)"
          >
            <Bot className="w-4 h-4" />
          </button>
        )}

        {/* Disappearing Messages Trigger */}
        <button
          onClick={onOpenDisappearingTimer}
          className={`p-2.5 rounded-xl transition-all ${
            disappearingTimer > 0
              ? 'text-orange-400 bg-orange-500/10 hover:bg-orange-500/20'
              : 'hover:text-orange-400 hover:bg-[#242f3d]'
          }`}
          title="Disappearing Messages Timer"
        >
          <Flame className="w-4 h-4" />
        </button>

        {/* Safety Number E2EE Trigger */}
        {isDirect && (
          <button
            onClick={onOpenSafetyNumber}
            className="p-2.5 rounded-xl hover:text-emerald-400 hover:bg-[#242f3d] transition-all"
            title="Verify Safety Number & QR Code"
          >
            <ShieldCheck className="w-4 h-4" />
          </button>
        )}

        {/* Mesh Radar Trigger */}
        <button
          onClick={onOpenMeshRadar}
          className="p-2.5 rounded-xl text-purple-400 hover:bg-[#242f3d] hover:text-purple-300 transition-all"
          title="P2P Mesh Radar & BLE Discovery"
        >
          <Compass className="w-4 h-4" />
        </button>

        {isDirect && !isBot && (
          <>
            <button
              onClick={() => onStartCall('voice')}
              className="p-2.5 rounded-xl hover:text-[#3fc5f0] hover:bg-[#242f3d] transition-all"
              title="Voice Call (WebRTC)"
            >
              <Phone className="w-4 h-4" />
            </button>

            <button
              onClick={() => onStartCall('video')}
              className="p-2.5 rounded-xl hover:text-[#3fc5f0] hover:bg-[#242f3d] transition-all"
              title="Video Call (WebRTC)"
            >
              <Video className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          onClick={onOpenSearch}
          className="p-2.5 rounded-xl hover:text-white hover:bg-[#242f3d] transition-all"
          title="Search messages"
        >
          <Search className="w-4 h-4" />
        </button>

        <button className="p-2.5 rounded-xl hover:text-white hover:bg-[#242f3d] transition-all" title="More options">
          <MoreVertical className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
