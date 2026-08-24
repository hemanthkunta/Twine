import React, { useState } from 'react';
import { Radio, X, Check, Cpu, Zap, Signal, Settings, Play, ShieldAlert, ArrowLeft } from 'lucide-react';
import { meshService } from '../services/mesh';
import { LoRaDeviceConfig } from '../types/index';

interface LoRaBridgeModalProps {
  onClose: () => void;
  onBack?: () => void;
}

export const LoRaBridgeModal: React.FC<LoRaBridgeModalProps> = ({ onClose, onBack }) => {
  const [config, setConfig] = useState<LoRaDeviceConfig>(meshService.getLoRaConfig());
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedFreq, setSelectedFreq] = useState(915.0);
  const [selectedBaud, setSelectedBaud] = useState(115200);

  const handleConnect = async () => {
    setIsConnecting(true);
    await meshService.connectLoRaSerial();
    setConfig(meshService.getLoRaConfig());
    setIsConnecting(false);
  };

  const handleDisconnect = () => {
    meshService.disconnectLoRa();
    setConfig(meshService.getLoRaConfig());
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d] mr-1"
                title="Back to Mesh Radar"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Meshtastic LoRa Radio Bridge</h3>
              <p className="text-[11px] text-[#7f91a4]">Long-Range 915/868 MHz Off-Grid Hardware Serial</p>
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
        <div className="p-6 space-y-4">
          {/* Hardware Connection Card */}
          <div className="p-4 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-[#17212b] text-[#3fc5f0] border border-[rgba(255,255,255,0.04)]">
                <Cpu className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">
                  {config.isConnected ? config.portName : 'No LoRa Radio Connected'}
                </div>
                <div className="text-[10px] text-[#7f91a4]">
                  {config.isConnected ? 'UART Web Serial Bridge Active • 22 dBm Tx' : 'Plug in Heltec V3, T-Beam, or RAK LoRa board'}
                </div>
              </div>
            </div>

            {config.isConnected ? (
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold border border-red-500/30"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all active:scale-95"
              >
                {isConnecting ? 'Pairing...' : 'Pair via Serial'}
              </button>
            )}
          </div>

          {/* Configuration Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#7f91a4] mb-1">
                Frequency Band
              </label>
              <select
                value={selectedFreq}
                onChange={(e) => setSelectedFreq(parseFloat(e.target.value))}
                className="w-full px-3 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff]"
              >
                <option value={915.0}>915.0 MHz (US / Americas)</option>
                <option value={868.0}>868.0 MHz (Europe / UK)</option>
                <option value={433.0}>433.0 MHz (Asia / Global)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#7f91a4] mb-1">
                UART Baud Rate
              </label>
              <select
                value={selectedBaud}
                onChange={(e) => setSelectedBaud(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-[#0f1822] border border-[rgba(255,255,255,0.08)] rounded-xl text-white text-xs focus:border-[#2f88ff]"
              >
                <option value={115200}>115200 bps (Standard)</option>
                <option value={921600}>921600 bps (High Speed)</option>
                <option value={9600}>9600 bps (Legacy)</option>
              </select>
            </div>
          </div>

          {/* Modem Preset Info */}
          <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[#7f91a4]">Modem Preset:</span>
              <span className="font-semibold text-[#3fc5f0]">LongFast (Primary)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#7f91a4]">Estimated Range:</span>
              <span className="font-semibold text-emerald-400">10 – 15 km Line-of-Sight</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#7f91a4]">E2EE ECDH Trust:</span>
              <span className="font-semibold text-purple-400">Preserved Over LoRa</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
