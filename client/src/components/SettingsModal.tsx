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
  Ban,
  UserCheck,
  Heart,
} from 'lucide-react';
import { User, UserSession, UserSummary } from '../types/index';
import { ApiService } from '../services/api';
import { THEME_PRESETS, ThemeService, ThemeDefinition } from '../services/theme.service';
import { WALLPAPER_PRESETS, WallpaperService, WallpaperDefinition } from '../services/wallpaper.service';
import { UserAvatar } from './UserAvatar';

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
  const [tab, setTab] = useState<'profile' | 'sessions' | 'appearance' | 'blocked'>('profile');
  const [displayName, setDisplayName] = useState(currentUser.display_name);
  const [username, setUsername] = useState(currentUser.username);
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url || '');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [wpEnabled, setWpEnabled] = useState<boolean>(WallpaperService.isEnabled());
  const [wpId, setWpId] = useState<string>(WallpaperService.getSelectedId());

  const toggleWallpaper = () => {
    const next = !wpEnabled;
    setWpEnabled(next);
    WallpaperService.setEnabled(next);
  };
  const selectWallpaper = (id: string) => {
    setWpId(id);
    setWpEnabled(true);
    WallpaperService.setWallpaper(id);
  };

  const [glassOn, setGlassOn] = useState<boolean>(WallpaperService.isGlassEnabled());
  const toggleGlass = () => {
    const next = !glassOn;
    setGlassOn(next);
    WallpaperService.setGlassEnabled(next);
  };

  useEffect(() => {
    if (tab === 'sessions') {
      ApiService.getSessions()
        .then((res) => setSessions(res.sessions))
        .catch((err) => console.error('Failed to load sessions', err));
    } else if (tab === 'blocked') {
      ApiService.getBlockedUsers()
        .then((res) => setBlockedUserIds(res.blockedUserIds || []))
        .catch(() => {});
      ApiService.getDemoUsers()
        .then((res) => setAllUsers(res.users || []))
        .catch(() => {});
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
      setSuccessMsg('Profile updated successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to revoke this session?')) return;
    try {
      await ApiService.revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      await ApiService.unblockUser(userId);
      setBlockedUserIds((prev) => prev.filter((id) => id !== userId));
      setSuccessMsg('User unblocked successfully');
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to unblock user');
    }
  };

  const blockedUsersList = allUsers.filter((u) => blockedUserIds.includes(u.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#2b5278]/40 border border-[#2b5278]/60 text-[#3fc5f0]">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Settings & Privacy</h2>
              <p className="text-xs text-[#7f91a4]">Account, appearance and security options</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#7f91a4] hover:text-white hover:bg-[#202b36] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[rgba(255,255,255,0.06)] bg-[#111922] px-3 sm:px-4 py-2 space-x-1.5 overflow-x-auto select-none">
          <button
            onClick={() => setTab('profile')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all flex-shrink-0 ${
              tab === 'profile'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>

          <button
            onClick={() => setTab('blocked')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all flex-shrink-0 ${
              tab === 'blocked'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
            }`}
          >
            <Ban className="w-3.5 h-3.5 text-red-400" />
            <span>Blocked ({blockedUserIds.length})</span>
          </button>

          <button
            onClick={() => setTab('appearance')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all flex-shrink-0 ${
              tab === 'appearance'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Themes</span>
          </button>

          <button
            onClick={() => setTab('sessions')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all flex-shrink-0 ${
              tab === 'sessions'
                ? 'bg-[#2b5278] text-white shadow'
                : 'text-[#7f91a4] hover:text-white hover:bg-[#242f3d]'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>Sessions</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto">
          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-500/15 border border-red-500/30 text-red-300 text-xs rounded-xl">
              {errorMsg}
            </div>
          )}

          {tab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-4">
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

          {tab === 'blocked' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] text-xs text-[#7f91a4] leading-relaxed">
                Blocked users cannot send you messages, see your online presence, or start voice & video calls with you.
              </div>

              {blockedUserIds.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-[#1c2836] mx-auto flex items-center justify-center text-emerald-400">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-white">No Blocked Contacts</p>
                  <p className="text-xs text-[#7f91a4]">
                    You can block unwanted contacts anytime using the 3-dots menu inside any direct chat.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {blockedUserIds.map((userId) => {
                    const user = allUsers.find((u) => u.id === userId);
                    return (
                      <div
                        key={userId}
                        className="p-3 bg-[#0f1822] border border-[rgba(255,255,255,0.06)] rounded-2xl flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <UserAvatar name={user?.display_name || 'User'} avatarUrl={user?.avatar_url} size="sm" />
                          <div>
                            <p className="text-xs font-bold text-white">{user?.display_name || userId}</p>
                            <p className="text-[11px] text-[#7f91a4]">@{user?.username || 'user'}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnblockUser(userId)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/30 transition-all flex items-center space-x-1"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Unblock</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'sessions' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#7f91a4] uppercase tracking-wider">
                  Active Devices & Web Sessions
                </span>
                {onOpenLinkDevice && (
                  <button
                    onClick={onOpenLinkDevice}
                    className="px-3 py-1 bg-[#2b5278] hover:bg-[#356391] text-white text-xs font-semibold rounded-lg transition-colors flex items-center space-x-1"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Link New Device</span>
                  </button>
                )}
              </div>

              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 bg-[#0f1822] border border-[rgba(255,255,255,0.06)] rounded-2xl flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="p-2 rounded-xl bg-[#1c2836] text-[#3fc5f0]">
                      <Laptop className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white">
                          {s.device_name || 'Browser Web Client'}
                        </span>
                        {s.is_current && (
                          <span className="px-1.5 py-0.5 bg-[#22c55e]/20 text-[#22c55e] text-[10px] font-bold rounded">
                            Current Session
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#7f91a4] flex items-center space-x-1.5 mt-0.5">
                        <span>{s.ip_address || '127.0.0.1'}</span>
                        <span>•</span>
                        <span>{new Date(s.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {!s.is_current && (
                    <button
                      onClick={() => handleRevokeSession(s.id)}
                      className="p-2 text-[#7f91a4] hover:text-[#ff3b30] hover:bg-[#ff3b30]/10 rounded-xl transition-all"
                      title="Terminate Session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'appearance' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-2.5">
                  Select Visual Theme
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {THEME_PRESETS.map((t: ThemeDefinition) => {
                    const isSelected = currentTheme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onThemeChange(t.id)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'bg-[#17212b] border-[#3fc5f0] ring-1 ring-[#3fc5f0]/40 shadow-lg'
                            : 'bg-[#0f1822] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
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

              {/* Live Couples Wallpaper */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="flex items-center space-x-1.5 text-xs font-bold text-[#7f91a4] uppercase tracking-wider">
                    <Heart className="w-3.5 h-3.5 text-[#ff7aa2]" />
                    <span>Live Chat Wallpaper</span>
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wpEnabled}
                    onClick={toggleWallpaper}
                    title={wpEnabled ? 'Disable live wallpaper' : 'Enable live wallpaper'}
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      wpEnabled ? 'bg-[#ff7aa2]' : 'bg-[#2b3543]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        wpEnabled ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 transition-opacity ${
                    wpEnabled ? '' : 'opacity-40 pointer-events-none'
                  }`}
                >
                  {WALLPAPER_PRESETS.map((w: WallpaperDefinition) => {
                    const isSel = wpId === w.id && wpEnabled;
                    return (
                      <button
                        key={w.id}
                        onClick={() => selectWallpaper(w.id)}
                        className={`p-3 rounded-2xl border text-left transition-all ${
                          isSel
                            ? 'border-[#ff7aa2] ring-1 ring-[#ff7aa2]/40 shadow-lg'
                            : 'bg-[#0f1822] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.15)]'
                        }`}
                        style={isSel ? { background: w.gradient } : undefined}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="flex -space-x-1">
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: w.preview[0] }}
                              />
                              <span
                                className="w-3.5 h-3.5 rounded-full border border-white/20"
                                style={{ backgroundColor: w.preview[1] }}
                              />
                            </span>
                            <span className="text-xs font-bold text-white">{w.name}</span>
                          </div>
                          {isSel && <Check className="w-4 h-4 text-[#ff7aa2]" />}
                        </div>
                        <p
                          className={`text-[10px] leading-relaxed line-clamp-2 ${
                            isSel ? 'text-white/80' : 'text-[#7f91a4]'
                          }`}
                        >
                          {w.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Liquid Glass Bubbles */}
              <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <Sparkles className="w-4 h-4 text-[#ff7aa2] flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Liquid Glass Bubbles</div>
                    <div className="text-[10px] text-[#7f91a4] leading-relaxed">
                      Frosted, translucent message bubbles with a drifting sheen — best with a live wallpaper behind them.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={glassOn}
                  onClick={toggleGlass}
                  title={glassOn ? 'Disable glass bubbles' : 'Enable glass bubbles'}
                  className={`relative w-11 h-6 rounded-full flex-shrink-0 ml-3 transition-colors ${
                    glassOn ? 'bg-[#ff7aa2]' : 'bg-[#2b3543]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      glassOn ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
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
