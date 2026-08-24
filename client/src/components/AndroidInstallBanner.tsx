import React, { useState } from 'react';
import { Download, Heart, X, Check, Sparkles } from 'lucide-react';
import { AndroidInstallerService } from '../services/androidInstaller.service';
import { TwineGlowingLogo } from './TwineGlowingLogo';

interface AndroidInstallBannerProps {
  onDismiss?: () => void;
}

export const AndroidInstallBanner: React.FC<AndroidInstallBannerProps> = ({ onDismiss }) => {
  const [downloaded, setDownloaded] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const handleInstallClick = async () => {
    setDownloaded(true);
    await AndroidInstallerService.promptInstall();
    setTimeout(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    }, 4000);
  };

  return (
    <div className="bg-gradient-to-r from-[#1a0a20] via-[#1b102b] to-[#0f111a] border-b border-[#ff007f]/30 px-4 py-2 flex items-center justify-between shadow-xl z-40 select-none">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <TwineGlowingLogo size="sm" />
        </div>
        <div>
          <div className="text-xs font-bold text-white flex items-center space-x-1.5">
            <span>Install Twine Android App</span>
            <span className="px-1.5 py-0.2 bg-[#ff007f]/20 text-[#ff758c] text-[10px] font-mono rounded border border-[#ff007f]/30">
              v3.0 APK
            </span>
          </div>
          <p className="text-[11px] text-[#7f91a4] hidden sm:block">
            Private couples & friends real-time messaging with offline BLE & LoRa radio mesh sync
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={handleInstallClick}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white text-xs font-bold shadow-md shadow-[#2f88ff]/25 flex items-center space-x-1.5 transition-all"
        >
          {downloaded ? (
            <>
              <Check className="w-4 h-4 text-emerald-300" />
              <span>APK Downloaded!</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span>Download & Install APK</span>
            </>
          )}
        </button>

        <button
          onClick={() => {
            setVisible(false);
            if (onDismiss) onDismiss();
          }}
          className="p-1.5 text-[#7f91a4] hover:text-white rounded-lg hover:bg-white/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
