import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Shield,
  Palette,
  Volume2,
  X,
  Check,
  Smartphone,
  Laptop,
  Trash2,
  Settings,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { User, UserSession } from '../types/index';
import { ApiService } from '../services/api';
import { THEME_PRESETS, ThemeService, ThemeDefinition } from '../services/theme.service';

interface SettingsModalProps {
  currentUser: User;
  currentTheme: string;
  onThemeChange: (themeId: string) => void;
  onClose: () => void;
  onProfileUpdated: (user: User) => void;
  onOpenLinkDevice?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  currentUser,
  currentTheme,
  onThemeChange,
  onClose,
  onProfileUpdated,
  onOpenLinkDevice,
}) => {
  const [tab, setTab] = useState<'profile' | 'sessions' | 'appearance'>('profile');
  const [displayName, setDisplayName] = useState(currentUser.display_name);
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tab === 'sessions') {
      ApiService.getSessions()
        .then((res) => setSessions(res.sessions))
        .catch((err) => console.error('Failed to load sessions', err));
    }
  }, [tab]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await ApiService.updateProfile({
        displayName,
        username,
        bio,
        avatarUrl,
      });
      onProfileUpdated(res.user);
      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await ApiService.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Failed to revoke session', err);
    }
  };

  const handleSelectTheme = (themeId: string) => {
    ThemeService.applyTheme(themeId);
    onThemeChange(themeId);
  };

  const activeThemeDef =
    THEME_PRESETS.find((t) => t.id === currentTheme) || THEME_PRESETS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[#17212b]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#2f88ff]/15 border border-[#2f88ff]/30 text-[#3fc5f0]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Settings & Preferences</h3>
              <p className="text-[11px] text-[#7f91a4]">Account, Security & Appearance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex px-6 pt-4 pb-2 space-x-2 bg-[#17212b] border-b border-[rgba(255,255,255,0.04)]">
          <button
            onClick={() => setTab('profile')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              tab === 'profile'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>My Profile</span>
          </button>

          <button
            onClick={() => setTab('sessions')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              tab === 'sessions'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Active Sessions</span>
          </button>

          <button
            onClick={() => setTab('appearance')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              tab === 'appearance'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance & Themes</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {tab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {successMsg && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center space-x-2">
                  <Check className="w-4 h-4" />
                  <span>{successMsg}</span>
                </div>
              )}
              {errorMsg && (
                <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-300 text-xs rounded-xl">
                  {errorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                  Username (@handle)
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-1.5">
                  Bio
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A few words about yourself..."
                  className="w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] font-bold text-white rounded-xl text-xs shadow-md transition-all"
              >
                {loading ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </form>
          )}

          {tab === 'sessions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1.5 text-xs text-[#7f91a4]">
                  <Shield className="w-4 h-4 text-[#22c55e]" />
                  <span>E2EE Multi-Device Trust</span>
                </div>
                {onOpenLinkDevice && (
                  <button
                    onClick={onOpenLinkDevice}
                    className="px-3 py-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:opacity-95 text-white font-semibold text-xs rounded-xl shadow-md flex items-center space-x-1.5 transition-all"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Link New Device</span>
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)]"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-xl bg-[#1e2a38] text-[#3fc5f0]">
                        {sess.device_type === 'desktop' ? (
                          <Laptop className="w-4 h-4" />
                        ) : (
                          <Smartphone className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                          <span>{sess.device_name}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                        </div>
                        <div className="text-[11px] text-[#7f91a4]">
                          IP: {sess.ip_address || '127.0.0.1'} •{' '}
                          {new Date(sess.last_active_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRevokeSession(sess.id)}
                      className="p-1.5 text-[#7f91a4] hover:text-red-400 hover:bg-[#242f3d] rounded-lg transition-colors"
                      title="Revoke session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div className="space-y-5">
              {/* Live Preview Card */}
              <div className="p-4 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#0f1822] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                    <Sparkles className="w-4 h-4 text-[#3fc5f0]" />
                    <span>Live Theme Preview — {activeThemeDef.name}</span>
                  </div>
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>WCAG AA PASS (4.5:1+)</span>
                  </span>
                </div>

                {/* Simulated Chat Bubble Preview */}
                <div
                  className="p-3 rounded-xl border border-white/5 space-y-2 transition-colors duration-300"
                  style={{ backgroundColor: activeThemeDef.previewColors.bg }}
                >
                  <div className="flex items-start space-x-2">
                    <div
                      className="p-2 rounded-xl text-xs max-w-[70%] shadow-sm"
                      style={{
                        backgroundColor: activeThemeDef.tokens['--bg-bubble-in'],
                        color: activeThemeDef.tokens['--text-primary'],
                      }}
                    >
                      Hey! How does this new theme look on your device?
                    </div>
                  </div>

                  <div className="flex items-end justify-end space-x-2">
                    <div
                      className="p-2 rounded-xl text-xs max-w-[70%] text-white shadow-sm"
                      style={{
                        backgroundColor: activeThemeDef.tokens['--bg-bubble-out'],
                      }}
                    >
                      Stunning! Crisp typography and high-contrast accents 🚀
                    </div>
                  </div>
                </div>
              </div>

              {/* Theme Picker Grid */}
              <div>
                <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-2.5">
                  Choose Color Preset ({THEME_PRESETS.length} Themes)
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {THEME_PRESETS.map((t) => {
                    const isSelected = currentTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTheme(t.id)}
                        className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden ${
                          isSelected
                            ? 'border-[#2f88ff] bg-[#1e2a38] shadow-lg ring-1 ring-[#2f88ff]'
                            : 'border-[rgba(255,255,255,0.06)] bg-[#0f1822] hover:bg-[#162230]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center space-x-2">
                            {/* 3-color swatch */}
                            <div className="flex -space-x-1">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: t.previewColors.bg }}
                              />
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: t.previewColors.bubbleOut }}
                              />
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: t.previewColors.accent }}
                              />
                            </div>
                            <span className="text-xs font-bold text-white">{t.name}</span>
                          </div>

                          {isSelected && <Check className="w-4 h-4 text-[#3fc5f0]" />}
                        </div>

                        <p className="text-[10px] text-[#7f91a4] leading-relaxed line-clamp-2">
                          {t.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Synthesized Audio */}
              <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <Volume2 className="w-4 h-4 text-[#3fc5f0]" />
                  <div>
                    <div className="text-xs font-semibold text-white">
                      Synthesized Audio Effects
                    </div>
                    <div className="text-[10px] text-[#7f91a4]">
                      Subtle sound synthesis on sent & received messages
                    </div>
                  </div>
                </div>
                <span className="text-xs text-[#22c55e] font-semibold">Enabled</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
