import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, X, Check, Copy, KeyRound, Lock, AlertTriangle } from 'lucide-react';
import { UserSummary } from '../types/index';
import { SignalClientService } from '../services/signalClient';
import QRCode from 'qrcode';

interface SafetyNumberModalProps {
  peer: UserSummary;
  myUserId: string;
  myDeviceId: number;
  onClose: () => void;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({ peer, myUserId, myDeviceId, onClose }) => {
  const [safetyNumber, setSafetyNumber] = useState<string>('Loading cryptographic fingerprint...');
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadSafetyNumber = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get safety number using Signal protocol identity keys
        const num = await SignalClientService.computeSafetyNumber(myUserId, myDeviceId, peer.id);
        if (!mounted) return;

        if (num) {
          setSafetyNumber(num);
          // Generate QR code for the safety number
          try {
            const qrData = `safetynumber:${num.replace(/\s/g, '')}`;
            const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
              width: 256,
              margin: 2,
              color: { dark: '#000000', light: '#FFFFFF' },
              errorCorrectionLevel: 'M',
            });
            const qrCodeElement = document.getElementById('safety-qr-code');
            if (qrCodeElement) {
              qrCodeElement.innerHTML = `<img src="${qrCodeDataUrl}" alt="Safety Number QR Code" className="w-24 h-24" />`;
            }
          } catch (qrErr) {
            console.warn('Failed to generate QR code:', qrErr);
          }
        } else {
          setError('Unable to compute safety number. Peer may not have published their identity key yet.');
        }

        // Load verification status
        const verified = await SignalClientService.isPeerVerified(myUserId, myDeviceId, peer.id);
        if (mounted) setIsVerified(verified);
      } catch (err) {
        if (mounted) {
          setError('Failed to load safety number');
          console.error('Safety number error:', err);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSafetyNumber();
    return () => { mounted = false; };
  }, [myUserId, myDeviceId, peer.id]);

  const toggleVerified = async () => {
    const next = !isVerified;
    try {
      await SignalClientService.setPeerVerified(myUserId, myDeviceId, peer.id, 1, next);
      setIsVerified(next);
    } catch (err) {
      console.error('Failed to update verification status:', err);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(safetyNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 12 groups of 5 digits
  const chunks = safetyNumber.split(' ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Verify Safety Number</h3>
              <p className="text-[11px] text-[#7f91a4]">End-to-End Encryption Trust Anchor</p>
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
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!error && (
            <>
              <p className="text-xs text-[#7f91a4] leading-relaxed">
                Compare this 60-digit number with <strong className="text-white font-semibold">{peer.display_name}</strong> in person or scan their QR code to verify no third party is intercepting your secret chat.
              </p>

              {/* QR Code Graphic Box */}
              <div className="flex justify-center my-2">
                <div className="p-4 bg-white rounded-2xl shadow-xl flex items-center justify-center">
                  <div className="w-36 h-36 border-4 border-black p-2 flex flex-col items-center justify-center space-y-1">
                    <div id="safety-qr-code" className="w-24 h-24" />
                    <span className="text-[9px] font-mono font-bold text-black">AEROGRAM E2EE</span>
                  </div>
                </div>
              </div>

              {/* 60-Digit Numbers Grid */}
              <div className="bg-[#0f1822] p-3.5 rounded-2xl border border-[rgba(255,255,255,0.06)] grid grid-cols-3 gap-2">
                {chunks.map((chunk, idx) => (
                  <div
                    key={idx}
                    className="py-1.5 px-2 bg-[#17212b] rounded-lg text-xs font-mono font-bold text-emerald-300 tracking-wider"
                  >
                    {chunk}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-2 pt-1">
                <button
                  onClick={handleCopy}
                  className="flex-1 py-2.5 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)] flex items-center justify-center space-x-1.5 transition-all"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied!' : 'Copy Numbers'}</span>
                </button>

                <button
                  onClick={toggleVerified}
                  className={`flex-1 py-2.5 font-semibold text-xs rounded-xl flex items-center justify-center space-x-1.5 transition-all ${
                    isVerified
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25'
                      : 'bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white shadow-lg shadow-[#2f88ff]/25'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isVerified ? 'Verified ✓' : 'Mark as Verified'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};