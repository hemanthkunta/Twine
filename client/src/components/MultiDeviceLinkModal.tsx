import React, { useState } from 'react';
import { Smartphone, Laptop, QrCode, X, Check, ShieldCheck, RefreshCw, Key, ArrowLeft } from 'lucide-react';
import { CryptoService } from '../services/crypto';

interface MultiDeviceLinkModalProps {
  onClose: () => void;
  onBack?: () => void;
}

export const MultiDeviceLinkModal: React.FC<MultiDeviceLinkModalProps> = ({ onClose, onBack }) => {
  const [pairingToken, setPairingToken] = useState<string>(
    `aerogram_link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  const [isLinking, setIsLinking] = useState(false);
  const [linkedSuccess, setLinkedSuccess] = useState(false);

  const handleSimulateScan = () => {
    setIsLinking(true);
    setTimeout(() => {
      setIsLinking(false);
      setLinkedSuccess(true);
    }, 1500);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d] mr-1"
                title="Back to Settings"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Link Secondary Device</h3>
              <p className="text-[11px] text-[#7f91a4]">Multi-Device E2EE Key Synchronization</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-center">
          {linkedSuccess ? (
            <div className="py-8 space-y-3 flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shadow-lg">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white">New Device Linked Successfully!</h4>
              <p className="text-xs text-[#7f91a4] max-w-xs">
                Your ECDH identity keys have been securely synchronized with end-to-end forward secrecy.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-lg"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-[#7f91a4] leading-relaxed">
                Scan this QR code from your secondary device (Tablet, Laptop, or Phone) to link it to your account without exposing private encryption keys.
              </p>

              {/* QR Code Container */}
              <div className="flex justify-center my-3">
                <div className="p-4 bg-white rounded-2xl shadow-xl flex flex-col items-center justify-center space-y-1">
                  <div className="w-36 h-36 border-4 border-black p-2 flex flex-col items-center justify-center space-y-1">
                    <QrCode className="w-24 h-24 text-black" />
                    <span className="text-[8px] font-mono font-bold text-black truncate max-w-[120px]">
                      {pairingToken}
                    </span>
                  </div>
                </div>
              </div>

              {/* Key Transfer Info */}
              <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] text-xs text-left space-y-1">
                <div className="flex items-center space-x-2 text-white font-medium">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>Double Ratchet Multi-Device Pairing</span>
                </div>
                <p className="text-[11px] text-[#7f91a4]">
                  Session keys are encrypted with an ephemeral ECDH handshake before transfer.
                </p>
              </div>

              <button
                onClick={handleSimulateScan}
                disabled={isLinking}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 transition-all"
              >
                {isLinking ? 'Authenticating Secondary Device...' : 'Simulate Secondary Device Scan'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
