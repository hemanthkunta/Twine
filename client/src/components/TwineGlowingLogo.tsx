import React from 'react';
import { Heart, Sparkles } from 'lucide-react';

interface TwineGlowingLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showEmber?: boolean;
}

export const TwineGlowingLogo: React.FC<TwineGlowingLogoProps> = ({ size = 'md', showEmber = true }) => {
  const sizeMap = {
    sm: { container: 'w-9 h-9', leftH: 'w-5 h-5 -translate-x-1.5', rightH: 'w-5 h-5 translate-x-1.5', spark: 'w-2.5 h-2.5' },
    md: { container: 'w-14 h-14', leftH: 'w-7 h-7 -translate-x-2', rightH: 'w-7 h-7 translate-x-2', spark: 'w-3.5 h-3.5' },
    lg: { container: 'w-20 h-20', leftH: 'w-10 h-10 -translate-x-3', rightH: 'w-10 h-10 translate-x-3', spark: 'w-5 h-5' },
    xl: { container: 'w-28 h-28', leftH: 'w-14 h-14 -translate-x-4', rightH: 'w-14 h-14 translate-x-4', spark: 'w-7 h-7' },
  };

  const current = sizeMap[size];

  return (
    <div className={`relative ${current.container} flex items-center justify-center select-none`}>
      {/* 1. Multi-Layer Realistic Ambient Bloom Flares */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-[#ff007f] via-[#b829ea] to-[#7928ca] opacity-70 blur-xl animate-pulse" />
      <div className="absolute -inset-1 rounded-3xl bg-[#ff007f] opacity-40 blur-md" />

      {/* 2. Glassmorphic Badge Container */}
      <div className={`relative ${current.container} rounded-2xl bg-[#120a1c]/90 p-1 flex items-center justify-center shadow-2xl border border-white/20 backdrop-blur-md overflow-hidden`}>
        {/* Ambient Radial Spotlight */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#ff007f]/30 via-transparent to-[#7928ca]/40 pointer-events-none" />

        {/* 3. Left Entwined Couple Heart (Neon Rose/Pink with Drop Shadow Glow) */}
        <div className={`absolute ${current.leftH} text-[#ff007f] drop-shadow-[0_0_12px_rgba(255,0,127,0.9)] animate-[heartbeat_2s_ease-in-out_infinite]`}>
          <Heart className="w-full h-full fill-current" />
        </div>

        {/* 4. Right Entwined Friends/Lover Heart (Neon Purple/Violet with Drop Shadow Glow) */}
        <div className={`absolute ${current.rightH} text-[#b829ea] opacity-90 mix-blend-screen drop-shadow-[0_0_14px_rgba(184,41,234,0.9)] animate-[heartbeat_2s_ease-in-out_infinite_0.3s]`}>
          <Heart className="w-full h-full fill-current" />
        </div>

        {/* 5. Center Intertwined Intersection Glow Dot */}
        <div className="absolute w-2 h-2 rounded-full bg-white/90 blur-[1px] shadow-[0_0_8px_#ffffff]" />

        {/* 6. Realistic Floating Glowing Sparkles & Embers */}
        {showEmber && (
          <>
            <div className="absolute -top-1 -right-1 animate-spin duration-3000">
              <Sparkles className={`${current.spark} text-amber-200 drop-shadow-[0_0_6px_#ffd700]`} />
            </div>
            <div className="absolute bottom-0.5 left-0.5 animate-pulse duration-1500">
              <div className="w-1.5 h-1.5 rounded-full bg-pink-300 shadow-[0_0_6px_#ff69b4]" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const BlowingHeartLogo = TwineGlowingLogo;

