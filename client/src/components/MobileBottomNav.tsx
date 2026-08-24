import React from 'react';
import { MessageSquare, Phone, Compass, Settings, Download } from 'lucide-react';
import { AndroidInstallerService } from '../services/androidInstaller.service';

interface MobileBottomNavProps {
  activeTab: 'chats' | 'calls' | 'mesh' | 'settings';
  unreadCount: number;
  onSelectTab: (tab: 'chats' | 'calls' | 'mesh' | 'settings') => void;
  onOpenMeshRadar: () => void;
  onOpenSettings: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  unreadCount,
  onSelectTab,
  onOpenMeshRadar,
  onOpenSettings,
}) => {
  const handleTabClick = (tab: 'chats' | 'calls' | 'mesh' | 'settings') => {
    if ('vibrate' in navigator) navigator.vibrate(15);
    onSelectTab(tab);
    if (tab === 'mesh') onOpenMeshRadar();
    if (tab === 'settings') onOpenSettings();
  };

  const handleDownloadApk = () => {
    if ('vibrate' in navigator) navigator.vibrate([30, 60]);
    AndroidInstallerService.downloadApkRelease();
  };

  return (
    <nav className="md:hidden flex items-center justify-around h-14 bg-theme-sidebar/95 backdrop-blur-xl border-t border-theme px-2 z-40 select-none safe-area-bottom">
      {/* 1. Chats Tab */}
      <button
        onClick={() => handleTabClick('chats')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all relative ${
          activeTab === 'chats' ? 'text-[#2f88ff]' : 'text-theme-secondary hover:text-theme-primary'
        }`}
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2 px-1.5 py-0.2 bg-[#2f88ff] text-white text-[9px] font-bold rounded-full border border-[#17212b]">
              {unreadCount}
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold mt-0.5">Chats</span>
      </button>

      {/* 2. P2P Mesh Tab */}
      <button
        onClick={() => handleTabClick('mesh')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'mesh' ? 'text-purple-400' : 'text-theme-secondary hover:text-theme-primary'
        }`}
      >
        <Compass className="w-5 h-5" />
        <span className="text-[10px] font-semibold mt-0.5">Mesh</span>
      </button>

      {/* 3. Download APK Quick Action */}
      <button
        onClick={handleDownloadApk}
        className="flex flex-col items-center justify-center flex-1 py-1 text-emerald-400 active:scale-95 transition-all"
        title="Download Android APK"
      >
        <div className="p-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
          <Download className="w-4 h-4" />
        </div>
        <span className="text-[9px] font-bold mt-0.5">Get APK</span>
      </button>

      {/* 4. Settings Tab */}
      <button
        onClick={() => handleTabClick('settings')}
        className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${
          activeTab === 'settings' ? 'text-[#3fc5f0]' : 'text-theme-secondary hover:text-theme-primary'
        }`}
      >
        <Settings className="w-5 h-5" />
        <span className="text-[10px] font-semibold mt-0.5">Settings</span>
      </button>
    </nav>
  );
};
