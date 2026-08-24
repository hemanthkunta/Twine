import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, ShieldCheck, Volume2 } from 'lucide-react';
import { UserSummary } from '../types/index.js';
import { UserAvatar } from './UserAvatar.js';

interface CallModalProps {
  peer: UserSummary;
  callType: 'voice' | 'video';
  onEndCall: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({ peer, callType, onEndCall }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(callType === 'video');
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<'calling' | 'connected'>('calling');

  useEffect(() => {
    // Simulate connection after 1.5s
    const connectTimer = setTimeout(() => {
      setStatus('connected');
    }, 1500);

    const timer = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    return () => {
      clearTimeout(connectTimer);
      clearInterval(timer);
    };
  }, []);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl">
      <div className="w-full max-w-sm glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.15)] text-center p-8 flex flex-col items-center justify-between min-h-[480px]">
        {/* Top Info */}
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>WebRTC End-to-End Encrypted</span>
          </div>
          <h3 className="text-xl font-bold text-white mt-1">{peer.display_name}</h3>
          <p className="text-xs text-[#3fc5f0] font-medium">
            {status === 'calling' ? 'Calling...' : formatDuration(duration)}
          </p>
        </div>

        {/* Center Visual / Avatar / Waves */}
        <div className="relative my-8">
          {status === 'connected' && (
            <div className="absolute inset-0 -m-4 rounded-full border-2 border-[#3fc5f0]/30 animate-ping opacity-75"></div>
          )}
          <UserAvatar name={peer.display_name} avatarUrl={peer.avatar_url} size="xl" className="shadow-2xl" />
        </div>

        {/* Call Controls */}
        <div className="flex items-center justify-center space-x-4 w-full pt-4">
          <button
            onClick={() => setIsMuted(!isMuted)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              isMuted
                ? 'bg-red-500 text-white'
                : 'bg-[#242f3d] text-white hover:bg-[#2f3f52]'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={onEndCall}
            className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform active:scale-95"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>

          <button
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              !isVideoOn
                ? 'bg-[#242f3d] text-white/50 hover:bg-[#2f3f52]'
                : 'bg-[#2b5278] text-white hover:bg-[#356391]'
            }`}
            title={isVideoOn ? 'Turn off video' : 'Turn on video'}
          >
            {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
