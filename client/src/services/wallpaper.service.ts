/**
 * Live "couples" chat wallpaper presets + persistence.
 *
 * Mirrors the shape/ergonomics of ThemeService: selection + enabled flag are
 * persisted to localStorage and a window CustomEvent is emitted on change so
 * the <LiveWallpaper/> layer can react without threading props through App.
 */

export type WallpaperKind = 'hearts' | 'aurora' | 'stars' | 'petals' | 'emoji';

export interface WallpaperDefinition {
  id: string;
  name: string;
  description: string;
  kind: WallpaperKind;
  /** Base gradient wash rendered behind the animated particles. */
  gradient: string;
  /** Primary accent used for particles / glow. */
  accent: string;
  /** Soft (translucent) accent used for shadows / auras. */
  accentSoft: string;
  /** Two-swatch preview for the picker chip. */
  preview: [string, string];
  /** For kind === 'emoji': the set of emojis scattered and bounced across the layer. */
  emojis?: string[];
}

export const WALLPAPER_PRESETS: WallpaperDefinition[] = [
  {
    id: 'floating_hearts',
    name: 'Hearts Ascending',
    description: 'Soft rose hearts drifting gently upward through a warm blush haze.',
    kind: 'hearts',
    gradient:
      'radial-gradient(circle at 78% 12%, rgba(255,122,162,0.18) 0%, transparent 55%), radial-gradient(circle at 15% 88%, rgba(244,114,182,0.14) 0%, transparent 55%), linear-gradient(160deg, #1a0f1a 0%, #241320 55%, #17101c 100%)',
    accent: '#ff7aa2',
    accentSoft: 'rgba(255,122,162,0.55)',
    preview: ['#ff7aa2', '#2a1420'],
  },
  {
    id: 'aurora_romance',
    name: 'Aurora Romance',
    description: 'Dreamy rose-and-violet light blooms drifting like a slow aurora.',
    kind: 'aurora',
    gradient: 'linear-gradient(150deg, #160f22 0%, #1e1230 60%, #140f1e 100%)',
    accent: '#c084fc',
    accentSoft: 'rgba(192,132,252,0.5)',
    preview: ['#c084fc', '#1b1030'],
  },
  {
    id: 'starlit_love',
    name: 'Starlit Love',
    description: 'A twilight sky of twinkling stars, a shooting light, and two glowing hearts.',
    kind: 'stars',
    gradient:
      'radial-gradient(circle at 50% -10%, rgba(129,140,248,0.16) 0%, transparent 60%), linear-gradient(180deg, #0b1026 0%, #12173a 60%, #0a0f24 100%)',
    accent: '#f9a8d4',
    accentSoft: 'rgba(249,168,212,0.6)',
    preview: ['#818cf8', '#0b1026'],
  },
  {
    id: 'rose_petals',
    name: 'Falling Petals',
    description: 'Warm sunset glow with rose petals tumbling softly on a gentle breeze.',
    kind: 'petals',
    gradient:
      'radial-gradient(circle at 82% 18%, rgba(251,146,60,0.16) 0%, transparent 55%), radial-gradient(circle at 12% 92%, rgba(244,63,94,0.14) 0%, transparent 55%), linear-gradient(160deg, #1c1016 0%, #26141a 55%, #1a0f14 100%)',
    accent: '#fb7185',
    accentSoft: 'rgba(251,113,133,0.6)',
    preview: ['#fb7185', '#26141a'],
  },
  {
    id: 'love_struck',
    name: 'Love Struck',
    description: 'A bouncing shower of hearts, kisses and happy faces in a rosy glow.',
    kind: 'emoji',
    emojis: ['💕', '😍', '🥰', '😘', '💖', '💝', '🫶', '💗', '💞', '😻'],
    gradient:
      'radial-gradient(circle at 75% 15%, rgba(255,122,162,0.20) 0%, transparent 55%), linear-gradient(160deg, #1d0f18 0%, #2a1422 55%, #1a0f1c 100%)',
    accent: '#ff7aa2',
    accentSoft: 'rgba(255,122,162,0.55)',
    preview: ['#ff7aa2', '#2a1422'],
  },
  {
    id: 'sweet_treats',
    name: 'Sweet Treats',
    description: 'Bouncing desserts and berries — a playful sugar-rush of shared cravings.',
    kind: 'emoji',
    emojis: ['🍓', '🍫', '🧁', '🍰', '🍒', '🥂', '🍡', '🍯', '🍩', '🍪'],
    gradient:
      'radial-gradient(circle at 80% 18%, rgba(251,146,60,0.18) 0%, transparent 55%), linear-gradient(160deg, #1f1310 0%, #2a1815 55%, #1c110e 100%)',
    accent: '#fbbf24',
    accentSoft: 'rgba(251,191,36,0.5)',
    preview: ['#fbbf24', '#2a1815'],
  },
  {
    id: 'teddy_cuddles',
    name: 'Teddy Cuddles',
    description: 'Cozy teddies, moons and clouds bobbing softly for sleepy goodnight chats.',
    kind: 'emoji',
    emojis: ['🧸', '🫂', '🌙', '☁️', '💤', '🤍', '⭐', '🌛'],
    gradient: 'linear-gradient(160deg, #131826 0%, #1a2033 55%, #10131f 100%)',
    accent: '#a5b4fc',
    accentSoft: 'rgba(165,180,252,0.45)',
    preview: ['#a5b4fc', '#1a2033'],
  },
  {
    id: 'celebrate_us',
    name: 'Celebrate Us',
    description: 'Confetti, balloons and bouquets bouncing for anniversaries and good news.',
    kind: 'emoji',
    emojis: ['🎉', '🥂', '🎈', '💐', '🎀', '✨', '🍾', '💫', '🎊', '🌹'],
    gradient:
      'radial-gradient(circle at 20% 85%, rgba(192,132,252,0.16) 0%, transparent 55%), linear-gradient(160deg, #1a1226 0%, #241733 55%, #160f22 100%)',
    accent: '#f0abfc',
    accentSoft: 'rgba(240,171,252,0.5)',
    preview: ['#f0abfc', '#241733'],
  },
  {
    id: 'cosmic_love',
    name: 'Cosmic Love',
    description: 'Moons, planets and sparkles drifting and bouncing across a deep night sky.',
    kind: 'emoji',
    emojis: ['💫', '🌙', '⭐', '🪐', '💜', '✨', '🌟', '☄️', '🌌', '🔮'],
    gradient:
      'radial-gradient(circle at 50% -10%, rgba(129,140,248,0.16) 0%, transparent 60%), linear-gradient(180deg, #0c0f24 0%, #141336 60%, #0a0c20 100%)',
    accent: '#c4b5fd',
    accentSoft: 'rgba(196,181,253,0.55)',
    preview: ['#c4b5fd', '#0c0f24'],
  },
];

const STORAGE_ID = 'twine_wallpaper_id';
const STORAGE_ENABLED = 'twine_wallpaper_enabled';
const STORAGE_GLASS = 'twine_glass_enabled';

/** Dispatched on window whenever the wallpaper selection / enabled flag changes. */
export const WALLPAPER_EVENT = 'twine:wallpaper-change';

export class WallpaperService {
  static getSelectedId(): string {
    return localStorage.getItem(STORAGE_ID) || WALLPAPER_PRESETS[0].id;
  }

  static isEnabled(): boolean {
    return localStorage.getItem(STORAGE_ENABLED) === '1';
  }

  static getActive(): WallpaperDefinition {
    const id = this.getSelectedId();
    return WALLPAPER_PRESETS.find((w) => w.id === id) || WALLPAPER_PRESETS[0];
  }

  /** Select a wallpaper (also enables the feature) and notify listeners. */
  static setWallpaper(id: string): void {
    const wp = WALLPAPER_PRESETS.find((w) => w.id === id) || WALLPAPER_PRESETS[0];
    localStorage.setItem(STORAGE_ID, wp.id);
    localStorage.setItem(STORAGE_ENABLED, '1');
    this.emit();
  }

  static setEnabled(enabled: boolean): void {
    localStorage.setItem(STORAGE_ENABLED, enabled ? '1' : '0');
    this.emit();
  }

  /**
   * Liquid-glass message bubbles. Toggled via a `glass-bubbles` class on
   * <html> so it's a pure-CSS switch (no React re-render). Defaults ON.
   */
  static isGlassEnabled(): boolean {
    return localStorage.getItem(STORAGE_GLASS) !== '0';
  }

  static setGlassEnabled(enabled: boolean): void {
    localStorage.setItem(STORAGE_GLASS, enabled ? '1' : '0');
    this.applyGlassClass(enabled);
  }

  static applyGlassClass(enabled: boolean): void {
    try {
      document.documentElement.classList.toggle('glass-bubbles', enabled);
    } catch {
      /* no-DOM guard */
    }
  }

  private static emit(): void {
    window.dispatchEvent(new CustomEvent(WALLPAPER_EVENT));
  }
}

// Apply the persisted glass-bubble preference to <html> as early as this
// module loads, so bubbles are frosted on first paint (default: on).
WallpaperService.applyGlassClass(WallpaperService.isGlassEnabled());
