import React, { useState } from 'react';
import { Plus, X, Heart, Send, Sparkles, Volume2 } from 'lucide-react';
import { User, UserSummary } from '../types/index';

interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  imageUrl: string;
  caption: string;
  timeAgo: string;
  hasUnseen: boolean;
}

const DEMO_STORIES: Story[] = [
  {
    id: 'st_1',
    userId: 'usr_alice_001',
    userName: 'Alice',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    imageUrl: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800',
    caption: '🚀 Testing our real-time WebSocket clustering and Mesh Bluetooth fallback at the summit!',
    timeAgo: '15m ago',
    hasUnseen: true,
  },
  {
    id: 'st_2',
    userId: 'usr_bob_002',
    userName: 'Bob',
    userAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    imageUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800',
    caption: '🛡️ End-to-end encryption keys verified with 60-digit safety numbers. Zero leaks!',
    timeAgo: '42m ago',
    hasUnseen: true,
  },
  {
    id: 'st_3',
    userId: 'usr_charlie_003',
    userName: 'Charlie',
    userAvatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800',
    caption: '📡 Testing LoRa 915MHz off-grid radio mesh over 5 kilometers. It works seamlessly!',
    timeAgo: '2h ago',
    hasUnseen: false,
  },
  {
    id: 'st_4',
    userId: 'usr_diana_004',
    userName: 'Diana',
    userAvatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150',
    imageUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800',
    caption: '⚡ Cyberpunk Neon Cyan theme activated. Aesthetic is next-level!',
    timeAgo: '3h ago',
    hasUnseen: false,
  },
];

interface StoriesBarProps {
  currentUser: User;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({ currentUser }) => {
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [liked, setLiked] = useState(false);
  const [replyText, setReplyText] = useState('');

  const handleOpenStory = (story: Story) => {
    if ('vibrate' in navigator) navigator.vibrate(15);
    setActiveStory(story);
    setLiked(false);
  };

  return (
    <>
      {/* Stories Horizontal Carousel */}
      <div className="px-3 py-2.5 bg-theme-sidebar border-b border-theme overflow-x-auto flex items-center space-x-3 scrollbar-none select-none">
        {/* Current User Story / Add Story */}
        <button
          onClick={() => handleOpenStory(DEMO_STORIES[0])}
          className="flex flex-col items-center space-y-1 flex-shrink-0 group"
        >
          <div className="relative">
            <div className="w-13 h-13 rounded-full p-0.5 bg-gradient-to-tr from-blue-500 via-cyan-400 to-emerald-400 flex items-center justify-center shadow-md">
              <img
                src={currentUser.avatar_url || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}
                alt={currentUser.display_name}
                className="w-12 h-12 rounded-full object-cover border-2 border-[#17212b]"
              />
            </div>
            <div className="absolute bottom-0 right-0 p-0.5 bg-[#2f88ff] text-white rounded-full border-2 border-[#17212b] shadow-sm">
              <Plus className="w-3 h-3 stroke-[3]" />
            </div>
          </div>
          <span className="text-[10px] font-medium text-theme-secondary truncate max-w-[56px]">
            Your Story
          </span>
        </button>

        {/* Other Users Stories */}
        {DEMO_STORIES.map((st) => (
          <button
            key={st.id}
            onClick={() => handleOpenStory(st)}
            className="flex flex-col items-center space-y-1 flex-shrink-0 group transition-transform active:scale-95"
          >
            <div
              className={`w-13 h-13 rounded-full p-0.5 ${
                st.hasUnseen
                  ? 'bg-gradient-to-tr from-[#f59e0b] via-[#ec4899] to-[#8b5cf6] animate-pulse'
                  : 'bg-white/20'
              } flex items-center justify-center shadow-md`}
            >
              <img
                src={st.userAvatar}
                alt={st.userName}
                className="w-12 h-12 rounded-full object-cover border-2 border-[#17212b]"
              />
            </div>
            <span className="text-[10px] font-medium text-theme-primary truncate max-w-[56px]">
              {st.userName}
            </span>
          </button>
        ))}
      </div>

      {/* Full-Screen Instagram / Telegram Story Viewer */}
      {activeStory && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-0 sm:p-4 backdrop-blur-xl">
          <div className="relative w-full max-w-sm h-full sm:h-[88vh] bg-black sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between border border-white/10">
            {/* Story Top Progress Bars */}
            <div className="absolute top-3 left-3 right-3 z-30 flex space-x-1.5">
              <div className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full animate-[progress_5s_linear_forwards]" />
              </div>
              <div className="h-1 flex-1 bg-white/20 rounded-full" />
            </div>

            {/* Story Header */}
            <div className="absolute top-6 left-3 right-3 z-30 flex items-center justify-between text-white">
              <div className="flex items-center space-x-2.5">
                <img
                  src={activeStory.userAvatar}
                  alt={activeStory.userName}
                  className="w-8 h-8 rounded-full border border-white/40 object-cover shadow"
                />
                <div>
                  <div className="text-xs font-bold flex items-center space-x-1">
                    <span>{activeStory.userName}</span>
                    <span className="text-[10px] text-white/70 font-normal">• {activeStory.timeAgo}</span>
                  </div>
                  <div className="text-[10px] text-pink-400 font-mono">📡 Twine Story</div>
                </div>
              </div>

              <button
                onClick={() => setActiveStory(null)}
                className="p-1.5 rounded-full bg-black/40 text-white/80 hover:text-white hover:bg-black/60 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Story Image */}
            <div className="relative flex-1 w-full bg-black flex items-center justify-center">
              <img
                src={activeStory.imageUrl}
                alt="Story Content"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
            </div>

            {/* Story Caption & Interactive Reply Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 z-30 bg-gradient-to-t from-black via-black/70 to-transparent">
              <p className="text-xs text-white leading-relaxed font-medium drop-shadow-md">
                {activeStory.caption}
              </p>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${activeStory.userName}...`}
                  className="flex-1 px-3.5 py-2 rounded-full bg-white/15 border border-white/20 text-white text-xs placeholder-white/50 focus:border-white focus:bg-white/25 outline-none backdrop-blur-md"
                />

                <button
                  onClick={() => {
                    if ('vibrate' in navigator) navigator.vibrate([20, 40]);
                    setLiked(!liked);
                  }}
                  className={`p-2 rounded-full border transition-all ${
                    liked
                      ? 'bg-red-500 text-white border-red-400 scale-110'
                      : 'bg-white/15 text-white border-white/20 hover:bg-white/25'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
                </button>

                {replyText.trim() && (
                  <button
                    onClick={() => {
                      alert(`Sent story reply to ${activeStory.userName}: "${replyText}"`);
                      setReplyText('');
                      setActiveStory(null);
                    }}
                    className="p-2 rounded-full bg-[#2f88ff] text-white shadow-lg"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
