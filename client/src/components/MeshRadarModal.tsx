import React, { useState, useEffect } from 'react';
import { Radio, Bluetooth, Wifi, X, RefreshCw, Shield, Zap, Signal, Compass } from 'lucide-react';
import { MeshPeer } from '../types/index';
import { meshService } from '../services/mesh';
import { CryptoService } from '../services/crypto';

interface MeshRadarModalProps {
  onClose: () => void;
  onOpenLoRa: () => void;
}

export const MeshRadarModal: React.FC<MeshRadarModalProps> = ({ onClose, onOpenLoRa }) => {
  const [peers, setPeers] = useState<MeshPeer[]>(meshService.getPeers());
  const [isScanning, setIsScanning] = useState(false);
  const [myPubkey] = useState(CryptoService.getPublicKey().slice(0, 18) + '...');

  useEffect(() => {
    const unsub = meshService.onPeersUpdated((updated) => setPeers(updated));
    return () => unsub();
  }, []);

  const handleScanBLE = async () => {
    setIsScanning(true);
    await meshService.scanBluetoothLE();
    setIsScanning(false);
  };

  const getSignalBadge = (rssi: number) => {
    if (rssi > -65) return { color: 'text-emerald-400', label: 'Strong' };
    if (rssi > -80) return { color: 'text-amber-400', label: 'Medium' };
    return { color: 'text-red-400', label: 'Weak' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-xl glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)] flex flex-col">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
              <Compass className="w-5 h-5 animate-spin" style={{ animationDuration: '10s' }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <span>Twine P2P Mesh Radar</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
                  {peers.length} Nodes In Range
                </span>
              </h3>
              <p className="text-[11px] text-[#7f91a4]">
                Off-Grid Bluetooth LE & LoRa Radio Hop Network
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Radar Graphic & Trust Anchor Info */}
        <div className="p-6 space-y-4">
          {/* Trust Anchor Badge */}
          <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-white font-medium">ECDH Trust Anchor:</span>
                <span className="ml-1 text-[#3fc5f0] font-mono">{myPubkey}</span>
              </div>
            </div>
            <span className="text-[10px] text-[#7f91a4]">Safety No. Preserved</span>
          </div>

          {/* Action Bar */}
          <div className="flex space-x-2.5">
            <button
              onClick={handleScanBLE}
              disabled={isScanning}
              className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 text-white font-semibold text-xs rounded-xl shadow-lg shadow-purple-600/25 flex items-center justify-center space-x-2 transition-all active:scale-95"
            >
              <Bluetooth className="w-4 h-4" />
              <span>{isScanning ? 'Scanning Bluetooth LE...' : 'Discover BLE Mesh Peers'}</span>
            </button>

            <button
              onClick={onOpenLoRa}
              className="py-2.5 px-4 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)] flex items-center space-x-2 transition-all active:scale-95"
            >
              <Radio className="w-4 h-4 text-amber-400" />
              <span>LoRa Bridge</span>
            </button>
          </div>

          {/* Discovered Nodes List */}
          <div>
            <h4 className="text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-2">
              Active Mesh Nodes & Relay Paths
            </h4>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {peers.map((peer) => {
                const sig = getSignalBadge(peer.rssi);
                return (
                  <div
                    key={peer.id}
                    className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between hover:border-[rgba(255,255,255,0.15)] transition-all"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-xl bg-[#17212b] text-purple-400 border border-[rgba(255,255,255,0.04)]">
                        {peer.transport === 'BLE' ? (
                          <Bluetooth className="w-4 h-4 text-[#3fc5f0]" />
                        ) : peer.transport === 'LORA_RADIO' ? (
                          <Radio className="w-4 h-4 text-amber-400" />
                        ) : (
                          <Wifi className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>

                      <div>
                        <div className="text-xs font-bold text-white flex items-center space-x-2">
                          <span>{peer.name}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        </div>
                        <div className="text-[10px] text-[#7f91a4] flex items-center space-x-2 mt-0.5">
                          <span>Transport: {peer.transport}</span>
                          <span>•</span>
                          <span className="font-mono text-purple-300">
                            {peer.hops === 1 ? 'Direct 1-Hop' : `${peer.hops} Hops`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-xs font-mono font-bold ${sig.color}`}>
                        {peer.rssi} dBm
                      </div>
                      <div className="text-[10px] text-[#7f91a4]">{sig.label} Signal</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
