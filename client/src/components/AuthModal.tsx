import React, { useState } from 'react';
import { UserCheck, Smartphone, Lock, User as UserIcon, X, Sparkles } from 'lucide-react';
import { User } from '../types/index';
import { ApiService } from '../services/api';
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      {/* Modal Container */}
      <div className="w-full max-w-md max-h-[92vh] flex flex-col glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)] relative my-auto">
        
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
        <div className="flex-shrink-0 relative px-6 pt-7 pb-4 text-center bg-gradient-to-b from-[#1b102b] to-[#17212b] border-b border-[rgba(255,255,255,0.06)]">
          <div className="flex justify-center mb-2">
            <TwineGlowingLogo size="md" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight bg-gradient-to-r from-[#ff007f] via-[#ff758c] to-[#b829ea] bg-clip-text text-transparent">
            Twine Messenger
          </h2>
          <p className="text-xs text-[#7f91a4] mt-1 font-normal flex items-center justify-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-pink-400" />
            <span>Private Real-Time Messenger for Couples & Friends</span>
          </p>

          {/* Navigation Tabs (Sign In & Register) */}
          <div className="flex bg-[#0f1822] p-1 rounded-xl mt-4 border border-[rgba(255,255,255,0.06)]">
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
        <div className="flex-1 overflow-y-auto p-6 max-h-[58vh] scrollbar-thin">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
              <span>{error}</span>
            </div>
          )}

          {tab === 'login' && (
            <div className="space-y-4">
              <form onSubmit={handleCustomLogin} className="space-y-4">
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
            </div>
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
        </div>
      </div>
    </div>
  );
};
