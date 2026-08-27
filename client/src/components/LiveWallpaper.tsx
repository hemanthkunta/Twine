import React, { useEffect, useMemo, useState } from 'react';
import {
  WallpaperService,
  WALLPAPER_EVENT,
  type WallpaperDefinition,
} from '../services/wallpaper.service';

/** Reusable heart path (used by the "stars" preset's glowing hearts). */
const HEART_PATH =
  'M12 21s-6.7-4.35-9.33-7.66C.9 11.2 1.2 8.1 3.4 6.6c1.9-1.3 4.3-.8 5.6.9L12 11l3-3.5c1.3-1.7 3.7-2.2 5.6-.9 2.2 1.5 2.5 4.6.73 6.74C18.7 16.65 12 21 12 21z';

interface WPState {
  enabled: boolean;
  wp: WallpaperDefinition;
}

const read = (): WPState => ({
  enabled: WallpaperService.isEnabled(),
  wp: WallpaperService.getActive(),
});

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Animated, romance-themed chat background that sits behind the message list.
 *
 * Pure CSS animation (transform/opacity only, so it stays GPU-cheap), pointer
 * events disabled, and it renders nothing unless the user has opted in. Motion
 * is disabled automatically under `prefers-reduced-motion` via index.css.
 */
export const LiveWallpaper: React.FC = () => {
  const [{ enabled, wp }, setState] = useState<WPState>(read);

  useEffect(() => {
    const update = () => setState(read());
    window.addEventListener(WALLPAPER_EVENT, update);
    // `storage` fires when another tab changes the selection.
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(WALLPAPER_EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);

  // Regenerate the particle field only when the wallpaper kind/id changes.
  const particles = useMemo(() => {
    const count =
      wp.kind === 'stars' ? 36 : wp.kind === 'aurora' ? 5 : wp.kind === 'emoji' ? 24 : 22;
    const emojiSet = wp.emojis && wp.emojis.length ? wp.emojis : ['💖'];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rand(0, 100),
      top: rand(0, 100),
      size: rand(12, 26),
      delay: rand(0, 14),
      duration: rand(9, 22),
      opacity: rand(0.3, 0.85),
      drift: rand(-40, 40),
      rotate: rand(-40, 40),
      emoji: emojiSet[Math.floor(rand(0, emojiSet.length))],
    }));
  }, [wp.id, wp.kind]);

  if (!enabled) return null;

  const rootStyle: React.CSSProperties = {
    background: wp.gradient,
    ['--lw-accent' as any]: wp.accent,
    ['--lw-accent-soft' as any]: wp.accentSoft,
  };

  return (
    <div className="lw-root" aria-hidden="true" style={rootStyle}>
      {wp.kind === 'aurora' &&
        particles.map((p) => (
          <span
            key={p.id}
            className="lw-aurora-blob"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size * 16}px`,
              height: `${p.size * 16}px`,
              animationDelay: `-${p.delay}s`,
              animationDuration: `${18 + p.duration}s`,
            }}
          />
        ))}

      {wp.kind === 'hearts' &&
        particles.map((p) => (
          <svg
            key={p.id}
            className="lw-heart"
            viewBox="0 0 24 24"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              opacity: p.opacity,
              animationDelay: `-${p.delay}s`,
              animationDuration: `${p.duration}s`,
              ['--lw-drift' as any]: `${p.drift}px`,
            }}
          >
            <path fill="var(--lw-accent)" d={HEART_PATH} />
          </svg>
        ))}

      {wp.kind === 'petals' &&
        particles.map((p) => (
          <span
            key={p.id}
            className="lw-petal"
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size * 0.72}px`,
              opacity: p.opacity,
              animationDelay: `-${p.delay}s`,
              animationDuration: `${p.duration}s`,
              ['--lw-drift' as any]: `${p.drift * 3}px`,
              ['--lw-rot' as any]: `${p.rotate * 8}deg`,
            }}
          />
        ))}

      {wp.kind === 'stars' && (
        <>
          {particles.map((p) => (
            <span
              key={p.id}
              className="lw-star"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: `${Math.max(2, p.size * 0.18)}px`,
                height: `${Math.max(2, p.size * 0.18)}px`,
                animationDelay: `-${p.delay}s`,
                animationDuration: `${2 + (p.duration % 4)}s`,
              }}
            />
          ))}
          <span className="lw-shooting" />
          <svg className="lw-glow-heart lw-glow-heart--a" viewBox="0 0 24 24">
            <path fill="var(--lw-accent)" d={HEART_PATH} />
          </svg>
          <svg className="lw-glow-heart lw-glow-heart--b" viewBox="0 0 24 24">
            <path fill="var(--lw-accent)" d={HEART_PATH} />
          </svg>
        </>
      )}

      {wp.kind === 'emoji' &&
        particles.map((p) => (
          <span
            key={p.id}
            className="lw-emoji"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              fontSize: `${p.size + 8}px`,
              opacity: p.opacity,
              animationDelay: `-${p.delay}s`,
              animationDuration: `${3 + (p.duration % 4)}s`,
              ['--lw-rot' as any]: `${p.rotate * 0.4}deg`,
            }}
          >
            {p.emoji}
          </span>
        ))}
    </div>
  );
};
