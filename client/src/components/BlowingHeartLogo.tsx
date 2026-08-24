import React from 'react';
import { Heart, Sparkles, Wind } from 'lucide-react';

interface BlowingHeartLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showBreeze?: boolean;
}

export const BlowingHeartLogo: React.FC<BlowingHeartLogoProps> = ({ size = 'md', showBreeze = true }) => {
  const sizeMap = {
    sm: { container: 'w-10 h-10', main: 'w-5 h-5', mini1: 'w-2.5 h-2.5', mini2: 'w-2 h-2' },
    md: { container: 'w-14 h-14', main: 'w-7 h-7', mini1: 'w-3.5 h-3.5', mini2: 'w-2.5 h-2.5' },
    lg: { container: 'w-20 h-20', main: 'w-10 h-10', mini1: 'w-5 h-5', mini2: 'w-3.5 h-3.5' },
    xl: { container: 'w-28 h-28', main: 'w-14 h-14', mini1: 'w-7 h-7', mini2: 'w-5 h-5' },
  };

  const current = sizeMap[size];

  return (
    <div className={`relative ${current.container} flex items-center justify-center select-none`}>
      {/* Ambient Pulsing Glow Backdrop */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-[#ff2a6d] via-[#ff5e7e] to-[#9900f0] opacity-80 blur-md animate-pulse" />

      {/* Main Solid Badge */}
      <div className={`relative ${current.container} rounded-2xl bg-gradient-to-tr from-[#ff2a6d] via-[#ff3366] to-[#9900f0] p-0.5 flex items-center justify-center shadow-xl shadow-[#ff2a6d]/40 border border-white/20`}>
        {/* Main Mother Heart */}
        <Heart className={`${current.main} text-white fill-current animate-[heartbeat_1.8s_ease-in-out_infinite]`} />

        {/* Floating / Blowing Mini Heart 1 */}
        {showBreeze && (
          <>
            <div className="absolute -top-1.5 -right-1.5 animate-[floatHeart1_2.5s_ease-in-out_infinite]">
              <Heart className={`${current.mini1} text-pink-300 fill-current drop-shadow-[0_0_8px_rgba(255,105,180,0.8)]`} />
            </div>

            {/* Floating / Blowing Mini Heart 2 */}
            <div className="absolute top-2 -right-3.5 animate-[floatHeart2_3s_ease-in-out_infinite]">
              <Heart className={`${current.mini2} text-rose-300 fill-current drop-shadow-[0_0_6px_rgba(255,182,193,0.8)]`} />
            </div>

            {/* Glowing Sparkle */}
            <div className="absolute -top-1 right-2 animate-spin duration-3000">
              <Sparkles className="w-2.5 h-2.5 text-amber-200" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const TwineGlowingLogo = BlowingHeartLogo;

