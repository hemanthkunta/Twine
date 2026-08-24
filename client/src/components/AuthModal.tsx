import React, { useState, useEffect } from 'react';
import { Heart, Shield, Sparkles, UserCheck, ArrowRight, Smartphone, Lock, User as UserIcon, X, ArrowLeft, Download } from 'lucide-react';
import { User, UserSummary } from '../types/index';
import { ApiService } from '../services/api';
import { UserAvatar } from './UserAvatar';
import { AndroidInstallerService } from '../services/androidInstaller.service';
import { TwineGlowingLogo } from './TwineGlowingLogo';

interface AuthModalProps {
  onSuccess: (user: User) => void;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, onClose }) => {
  const [tab, setTab] = useState<'demo' | 'login' | 'register'>('demo');
  const [demoUsers, setDemoUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom Form fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('password123');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    ApiService.getDemoUsers()
      .then((res) => setDemoUsers(res.users))
      .catch((err) => console.error('Failed to load demo profiles:', err));
  }, []);

  const handleDemoSelect = async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.demoLogin(userId);
      AndroidInstallerService.downloadApkRelease(res.user.display_name);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your phone number or username');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.login(identifier, password);
      AndroidInstallerService.downloadApkRelease(res.user.display_name);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim() || !displayName.trim()) {
      setError('Phone number and display name are required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.register({
        phoneNumber,
        username: username || displayName.toLowerCase().replace(/\s+/g, '_'),
        displayName,
        password,
      });
      AndroidInstallerService.downloadApkRelease(res.user.display_name);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDismissOrAutoEnter = () => {
    if (demoUsers.length > 0) {
      handleDemoSelect(demoUsers[0].id);
    } else if (onClose) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      {/* Modal Container */}
      <div className="w-full max-w-md max-h-[90vh] flex flex-col glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)] relative my-auto">
        
        {/* Top-Left Back Button (Always Visible & In-View) */}
        <div className="absolute top-3.5 left-3.5 z-30">
          {tab !== 'demo' ? (
            <button
              type="button"
              onClick={() => {
                setTab('demo');
                setError(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#17212b] hover:bg-[#243242] text-white border border-white/15 transition-all flex items-center space-x-1.5 text-xs font-bold shadow-lg"
              title="Back to Demo Profiles"
            >
              <ArrowLeft className="w-4 h-4 text-[#ff758c]" />
              <span>Back</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDismissOrAutoEnter}
              className="px-3 py-1.5 rounded-xl bg-[#17212b] hover:bg-[#243242] text-white border border-white/15 transition-all flex items-center space-x-1.5 text-xs font-bold shadow-lg"
              title="Enter App (Demo Mode)"
            >
              <ArrowLeft className="w-4 h-4 text-[#ff758c]" />
              <span>Enter App</span>
            </button>
          )}
        </div>

        {/* Top-Right X Close Button (Always Visible & In-View) */}
        <button
          type="button"
          onClick={handleDismissOrAutoEnter}
          className="absolute top-3.5 right-3.5 z-30 p-2 rounded-xl bg-[#17212b] hover:bg-[#243242] text-white border border-white/15 transition-all shadow-lg"
          title="Close / Enter App"
        >
          <X className="w-5 h-5 text-[#7f91a4] hover:text-white" />
        </button>

        {/* Header Branding (Non-shrinking) */}
        <div className="flex-shrink-0 relative px-6 pt-12 pb-5 text-center bg-gradient-to-b from-[#1b102b] to-[#17212b] border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex justify-center mb-2.5">
            <TwineGlowingLogo size="md" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] bg-clip-text text-transparent">
            Twine Messenger
          </h2>
          <p className="text-xs text-[#7f91a4] mt-1 font-normal flex items-center justify-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span>Private Real-Time Messenger for Couples & Friends</span>
          </p>

          {/* Navigation Tabs */}
          <div className="flex bg-[#0f1822] p-1 rounded-xl mt-4 border border-[rgba(255,255,255,0.06)]">
            <button
              onClick={() => { setTab('demo'); setError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                tab === 'demo' ? 'bg-[#2b5278] text-white shadow' : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              1-Click Demo Profiles
            </button>
            <button
              onClick={() => { setTab('login'); setError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                tab === 'login' ? 'bg-[#2b5278] text-white shadow' : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('register'); setError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                tab === 'register' ? 'bg-[#2b5278] text-white shadow' : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Content Body (Scrollable Container) */}
        <div className="flex-1 overflow-y-auto p-6 max-h-[52vh]">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
              <span>{error}</span>
            </div>
          )}

          {tab === 'demo' && (
            <div className="space-y-3">
              <p className="text-xs text-[#7f91a4] mb-3">
                Select an account to test instant bidirectional messaging, live typing indicators, and read receipts:
              </p>

              <div className="space-y-2">
                {demoUsers.map((user) => (
                  <button
                    key={user.id}
                    disabled={loading}
                    onClick={() => handleDemoSelect(user.id)}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-[#1e2c3a] hover:bg-[#27384a] border border-[rgba(255,255,255,0.06)] hover:border-[#2f88ff]/40 transition-all text-left group"
                  >
                    <div className="flex items-center space-x-3">
                      <UserAvatar name={user.display_name} avatarUrl={user.avatar_url} size="md" isOnline={user.is_online} />
                      <div>
                        <div className="text-sm font-semibold text-white group-hover:text-[#3fc5f0] transition-colors">
                          {user.display_name}
                        </div>
                        <div className="text-xs text-[#7f91a4]">@{user.username}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 text-[#7f91a4] group-hover:text-white">
                      <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">Login</span>
                      <ArrowRight className="w-4 h-4 transform group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </button>
                ))}
              </div>

              {/* Quick Android APK Download Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => AndroidInstallerService.downloadApkRelease()}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600/30 via-teal-600/30 to-blue-600/30 hover:from-emerald-600/40 hover:to-blue-600/40 border border-emerald-500/40 text-emerald-300 hover:text-white text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md active:scale-98"
                >
                  <Download className="w-4 h-4 text-pink-400" />
                  <span>📲 Download Twine Android APK (v3.0)</span>
                </button>
              </div>
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleCustomLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1.5">Phone Number or Username</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. alice or +12345678901"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff] focus:ring-1 focus:ring-[#2f88ff] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff] focus:ring-1 focus:ring-[#2f88ff] transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-90 font-semibold text-white rounded-xl text-sm shadow-lg shadow-[#2f88ff]/20 transition-all flex items-center justify-center space-x-2"
              >
                {loading ? <span className="animate-spin text-sm">⏳</span> : <UserCheck className="w-4 h-4" />}
                <span>Sign In to Aether</span>
              </button>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Satoshi Nakamoto"
                  className="w-full px-3.5 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1">Username handle</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. satoshi"
                  className="w-full px-3.5 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1">Phone Number (with country code)</label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-[#7f91a4] absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 555 0192"
                    className="w-full pl-9 pr-3.5 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 mt-2 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-90 font-semibold text-white rounded-xl text-sm shadow-lg transition-all"
              >
                {loading ? 'Creating account...' : 'Create Account & Start Chatting'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
