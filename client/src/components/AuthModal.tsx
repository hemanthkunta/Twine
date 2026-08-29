import React, { useState } from 'react';
import { UserCheck, Smartphone, Lock, User as UserIcon, X, Sparkles, Download, Check } from 'lucide-react';
import { User } from '../types/index';
import { ApiService } from '../services/api';
import { AndroidInstallerService } from '../services/androidInstaller.service';
import { TwineGlowingLogo } from './TwineGlowingLogo';

interface AuthModalProps {
  onSuccess: (user: User) => void;
  onClose?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, onClose }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login Form fields
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Register Form fields
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your phone number or username');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.login(identifier.trim(), password);
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed. Check your credentials.');
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
    if (!regPassword) {
      setError('Please enter a password');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.register({
        phoneNumber: phoneNumber.trim(),
        username: (username || displayName).toLowerCase().replace(/\s+/g, '_'),
        displayName: displayName.trim(),
        password: regPassword,
      });
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const [appInstalled, setAppInstalled] = useState(false);

  const handleInstallApp = async () => {
    setAppInstalled(true);
    await AndroidInstallerService.promptInstall();
    setTimeout(() => setAppInstalled(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      {/* Modal Container */}
      <div className="w-full max-w-md max-h-[94vh] max-h-[94dvh] flex flex-col glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)] relative my-auto">
        
        {/* Optional Close Button (Only if already logged in / switch account mode) */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3.5 right-3.5 z-30 p-2 rounded-xl bg-[#17212b] hover:bg-[#243242] text-white border border-white/15 transition-all shadow-lg"
            title="Close"
          >
            <X className="w-5 h-5 text-[#7f91a4] hover:text-white" />
          </button>
        )}

        {/* Header Branding */}
        <div className="flex-shrink-0 relative px-6 pt-6 pb-3 text-center bg-gradient-to-b from-[#1b102b] to-[#17212b] border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex justify-center mb-1.5">
            <TwineGlowingLogo size="md" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] bg-clip-text text-transparent">
            Twine Messenger
          </h2>
          <p className="text-xs text-[#7f91a4] mt-1 font-normal flex items-center justify-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span>Private Real-Time Messenger for Couples & Friends</span>
          </p>

          {/* Navigation Tabs (Sign In & Register) */}
          <div className="flex bg-[#0f1822] p-1 rounded-xl mt-3.5 border border-[rgba(255,255,255,0.06)]">
            <button
              onClick={() => { setTab('login'); setError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                tab === 'login' ? 'bg-[#2b5278] text-white shadow' : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('register'); setError(null); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                tab === 'register' ? 'bg-[#2b5278] text-white shadow' : 'text-[#7f91a4] hover:text-white'
              }`}
            >
              Register
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-h-[60vh] max-h-[60dvh] scrollbar-thin space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
              <span>{error}</span>
            </div>
          )}

          {tab === 'login' && (
            <form onSubmit={handleCustomLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1.5">Username or Phone</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Username (e.g. alice or bob)"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff] focus:ring-1 focus:ring-[#2f88ff] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff] focus:ring-1 focus:ring-[#2f88ff] transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] hover:opacity-95 font-semibold text-white rounded-xl text-sm shadow-lg shadow-[#ff007f]/25 transition-all flex items-center justify-center space-x-2"
              >
                {loading ? <span className="animate-spin text-sm">⏳</span> : <UserCheck className="w-4 h-4" />}
                <span>Sign In</span>
              </button>
            </form>
          )}

          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Alice Walker"
                  className="w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. alice_walker"
                  className="w-full px-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1">Phone Number</label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-[#7f91a4] absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+12345678901"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#7f91a4] mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#7f91a4] absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Create a password"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0f1822] border border-[rgba(255,255,255,0.1)] rounded-xl text-white text-sm focus:border-[#2f88ff]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 mt-2 bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] hover:opacity-95 font-semibold text-white rounded-xl text-sm shadow-lg transition-all"
              >
                {loading ? 'Creating account...' : 'Create Account & Start Chatting'}
              </button>
            </form>
          )}

          {/* Dedicated Download Mobile App / APK CTA on Login Screen */}
          <div className="pt-2 border-t border-[rgba(255,255,255,0.08)]">
            <div className="p-3 bg-gradient-to-r from-[#1a0a20] via-[#1b102b] to-[#0f111a] border border-[#ff007f]/30 rounded-2xl flex items-center justify-between shadow-md">
              <div className="flex items-center space-x-2.5 min-w-0 mr-2">
                <div className="p-2 rounded-xl bg-gradient-to-tr from-[#ff007f]/20 to-[#b829ea]/20 border border-[#ff007f]/30 text-[#ff758c] flex-shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center space-x-1.5">
                    <span className="truncate">Get Twine Android App</span>
                    <span className="px-1.5 py-0.2 bg-[#ff007f]/20 text-[#ff758c] text-[9px] font-mono rounded border border-[#ff007f]/30 font-semibold flex-shrink-0">
                      v3.0 APK
                    </span>
                  </div>
                  <p className="text-[11px] text-[#7f91a4] truncate">Offline Bluetooth mesh & push calls</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleInstallApp}
                className="px-3.5 py-1.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-md shadow-[#2f88ff]/25 flex items-center space-x-1.5 flex-shrink-0 transition-all active:scale-95"
              >
                {appInstalled ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Installed</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Download APK</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
