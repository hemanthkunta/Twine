export interface ThemeDefinition {
  id: string;
  name: string;
  category: 'dark' | 'light';
  description: string;
  previewColors: {
    bg: string;
    sidebar: string;
    accent: string;
    bubbleOut: string;
  };
  tokens: {
    '--bg-primary': string;
    '--bg-sidebar': string;
    '--bg-header': string;
    '--bg-input': string;
    '--bg-hover': string;
    '--bg-active': string;
    '--bg-bubble-in': string;
    '--bg-bubble-out': string;
    '--text-primary': string;
    '--text-secondary': string;
    '--text-muted': string;
    '--accent-primary': string;
    '--accent-secondary': string;
    '--border-color': string;
    '--ambient-glow-1': string;
    '--ambient-glow-2': string;
    '--chat-bg-gradient': string;
    '--chat-bg-pattern': string;
    '--chat-pattern-opacity': string;
  };
}

export const THEME_PRESETS: ThemeDefinition[] = [
  {
    id: 'classic_dark',
    name: 'Aerogram Classic Dark',
    category: 'dark',
    description: 'Classic Aerogram desktop aesthetic with constellation star texture.',
    previewColors: {
      bg: '#0e1621',
      sidebar: '#17212b',
      accent: '#2f88ff',
      bubbleOut: '#2b5278',
    },
    tokens: {
      '--bg-primary': '#0e1621',
      '--bg-sidebar': '#17212b',
      '--bg-header': '#17212b',
      '--bg-input': '#0f1822',
      '--bg-hover': '#202b36',
      '--bg-active': '#2b5278',
      '--bg-bubble-in': '#182533',
      '--bg-bubble-out': '#2b5278',
      '--text-primary': '#ffffff',
      '--text-secondary': '#7f91a4',
      '--text-muted': '#5e6d7d',
      '--accent-primary': '#2f88ff',
      '--accent-secondary': '#3fc5f0',
      '--border-color': 'rgba(255, 255, 255, 0.08)',
      '--ambient-glow-1': 'rgba(47, 136, 255, 0.12)',
      '--ambient-glow-2': 'rgba(63, 197, 240, 0.08)',
      '--chat-bg-gradient': 'radial-gradient(circle at 85% 15%, rgba(47, 136, 255, 0.07) 0%, transparent 60%), radial-gradient(circle at 15% 85%, rgba(63, 197, 240, 0.05) 0%, transparent 60%)',
      '--chat-bg-pattern': `radial-gradient(rgba(255, 255, 255, 0.05) 1.2px, transparent 1.2px)`,
      '--chat-pattern-opacity': '0.05',
    },
  },
  {
    id: 'midnight_oled',
    name: 'Midnight OLED',
    category: 'dark',
    description: 'Pure pitch-black theme with high-contrast electric blue edge lighting.',
    previewColors: {
      bg: '#000000',
      sidebar: '#0a0a0a',
      accent: '#3b82f6',
      bubbleOut: '#1d4ed8',
    },
    tokens: {
      '--bg-primary': '#000000',
      '--bg-sidebar': '#0a0a0a',
      '--bg-header': '#0a0a0a',
      '--bg-input': '#121212',
      '--bg-hover': '#1c1c1c',
      '--bg-active': '#2563eb',
      '--bg-bubble-in': '#141414',
      '--bg-bubble-out': '#1d4ed8',
      '--text-primary': '#ffffff',
      '--text-secondary': '#a3a3a3',
      '--text-muted': '#737373',
      '--accent-primary': '#3b82f6',
      '--accent-secondary': '#60a5fa',
      '--border-color': 'rgba(255, 255, 255, 0.12)',
      '--ambient-glow-1': 'rgba(59, 130, 246, 0.15)',
      '--ambient-glow-2': 'rgba(96, 165, 250, 0.08)',
      '--chat-bg-gradient': 'radial-gradient(circle at 90% 10%, rgba(59, 130, 246, 0.09) 0%, transparent 50%)',
      '--chat-bg-pattern': `linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`,
      '--chat-pattern-opacity': '0.03',
    },
  },
  {
    id: 'cyberpunk_cyan',
    name: 'Cyberpunk Neon Cyan',
    category: 'dark',
    description: 'Futuristic deep navy with holographic cyber grid lines and dynamic cyan glow.',
    previewColors: {
      bg: '#050f1a',
      sidebar: '#0b1928',
      accent: '#00f0ff',
      bubbleOut: '#0369a1',
    },
    tokens: {
      '--bg-primary': '#050f1a',
      '--bg-sidebar': '#0b1928',
      '--bg-header': '#0b1928',
      '--bg-input': '#071524',
      '--bg-hover': '#10263d',
      '--bg-active': '#0284c7',
      '--bg-bubble-in': '#0c2136',
      '--bg-bubble-out': '#0369a1',
      '--text-primary': '#ffffff',
      '--text-secondary': '#7dd3fc',
      '--text-muted': '#38bdf8',
      '--accent-primary': '#00f0ff',
      '--accent-secondary': '#38bdf8',
      '--border-color': 'rgba(0, 240, 255, 0.18)',
      '--ambient-glow-1': 'rgba(0, 240, 255, 0.18)',
      '--ambient-glow-2': 'rgba(56, 189, 248, 0.12)',
      '--chat-bg-gradient': 'radial-gradient(circle at 80% 20%, rgba(0, 240, 255, 0.1) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(2, 132, 199, 0.12) 0%, transparent 60%)',
      '--chat-bg-pattern': `linear-gradient(rgba(0, 240, 255, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 240, 255, 0.04) 1px, transparent 1px)`,
      '--chat-pattern-opacity': '0.07',
    },
  },
  {
    id: 'obsidian_emerald',
    name: 'Obsidian Emerald',
    category: 'dark',
    description: 'Dark forest obsidian with organic topographic elevation contours and emerald aura.',
    previewColors: {
      bg: '#081410',
      sidebar: '#0f231c',
      accent: '#10b981',
      bubbleOut: '#047857',
    },
    tokens: {
      '--bg-primary': '#081410',
      '--bg-sidebar': '#0f231c',
      '--bg-header': '#0f231c',
      '--bg-input': '#0b1b16',
      '--bg-hover': '#16362b',
      '--bg-active': '#059669',
      '--bg-bubble-in': '#122c23',
      '--bg-bubble-out': '#047857',
      '--text-primary': '#ffffff',
      '--text-secondary': '#6ee7b7',
      '--text-muted': '#34d399',
      '--accent-primary': '#10b981',
      '--accent-secondary': '#34d399',
      '--border-color': 'rgba(16, 185, 129, 0.18)',
      '--ambient-glow-1': 'rgba(16, 185, 129, 0.15)',
      '--ambient-glow-2': 'rgba(52, 211, 153, 0.08)',
      '--chat-bg-gradient': 'radial-gradient(circle at 75% 25%, rgba(16, 185, 129, 0.09) 0%, transparent 65%), radial-gradient(circle at 25% 75%, rgba(4, 120, 87, 0.1) 0%, transparent 65%)',
      '--chat-bg-pattern': `radial-gradient(rgba(16, 185, 129, 0.06) 1.5px, transparent 1.5px)`,
      '--chat-pattern-opacity': '0.06',
    },
  },
  {
    id: 'solar_sunset',
    name: 'Solar Sunset',
    category: 'dark',
    description: 'Dusk violet with cosmic stardust texture and warm glowing amber light.',
    previewColors: {
      bg: '#120d1c',
      sidebar: '#1d152d',
      accent: '#f59e0b',
      bubbleOut: '#6d28d9',
    },
    tokens: {
      '--bg-primary': '#120d1c',
      '--bg-sidebar': '#1d152d',
      '--bg-header': '#1d152d',
      '--bg-input': '#171024',
      '--bg-hover': '#2a1e40',
      '--bg-active': '#7c3aed',
      '--bg-bubble-in': '#241a37',
      '--bg-bubble-out': '#6d28d9',
      '--text-primary': '#ffffff',
      '--text-secondary': '#c4b5fd',
      '--text-muted': '#a78bfa',
      '--accent-primary': '#f59e0b',
      '--accent-secondary': '#fbbf24',
      '--border-color': 'rgba(245, 158, 11, 0.18)',
      '--ambient-glow-1': 'rgba(245, 158, 11, 0.14)',
      '--ambient-glow-2': 'rgba(109, 40, 217, 0.14)',
      '--chat-bg-gradient': 'radial-gradient(circle at 85% 15%, rgba(245, 158, 11, 0.09) 0%, transparent 60%), radial-gradient(circle at 15% 85%, rgba(109, 40, 217, 0.12) 0%, transparent 60%)',
      '--chat-bg-pattern': `radial-gradient(rgba(245, 158, 11, 0.06) 1.2px, transparent 1.2px)`,
      '--chat-pattern-opacity': '0.07',
    },
  },
  {
    id: 'snow_light',
    name: 'Arctic Snow Light',
    category: 'light',
    description: 'Clean frosted pearl with subtle hexagonal honeycomb lattice (WCAG AAA compliant).',
    previewColors: {
      bg: '#f1f5f9',
      sidebar: '#ffffff',
      accent: '#2563eb',
      bubbleOut: '#2563eb',
    },
    tokens: {
      '--bg-primary': '#f1f5f9',
      '--bg-sidebar': '#ffffff',
      '--bg-header': '#ffffff',
      '--bg-input': '#e2e8f0',
      '--bg-hover': '#e2e8f0',
      '--bg-active': '#dbeafe',
      '--bg-bubble-in': '#ffffff',
      '--bg-bubble-out': '#2563eb',
      '--text-primary': '#0f172a',
      '--text-secondary': '#475569',
      '--text-muted': '#64748b',
      '--accent-primary': '#2563eb',
      '--accent-secondary': '#3b82f6',
      '--border-color': 'rgba(0, 0, 0, 0.1)',
      '--ambient-glow-1': 'rgba(37, 99, 235, 0.06)',
      '--ambient-glow-2': 'rgba(59, 130, 246, 0.04)',
      '--chat-bg-gradient': 'radial-gradient(circle at 90% 10%, rgba(37, 99, 235, 0.05) 0%, transparent 50%)',
      '--chat-bg-pattern': `radial-gradient(rgba(0, 0, 0, 0.04) 1.2px, transparent 1.2px)`,
      '--chat-pattern-opacity': '0.04',
    },
  },
];

export class ThemeService {
  private static activeThemeId = 'classic_dark';

  static init() {
    const saved = localStorage.getItem('aerogram_theme_id') || 'classic_dark';
    this.applyTheme(saved);
  }

  static getActiveTheme(): ThemeDefinition {
    return (
      THEME_PRESETS.find((t) => t.id === this.activeThemeId) ||
      THEME_PRESETS[0]
    );
  }

  static applyTheme(themeId: string): ThemeDefinition {
    const theme = THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0];
    this.activeThemeId = theme.id;
    localStorage.setItem('aerogram_theme_id', theme.id);

    const root = document.documentElement;
    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-theme-category', theme.category);

    for (const [key, val] of Object.entries(theme.tokens)) {
      root.style.setProperty(key, val);
    }

    return theme;
  }
}

ThemeService.init();
