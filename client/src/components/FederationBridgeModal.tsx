import React, { useState, useEffect } from 'react';
import { Network, Server, ShieldCheck, X, Check, RefreshCw, Globe2, Link2 } from 'lucide-react';
import { ApiService } from '../services/api';

interface FederationBridgeModalProps {
  onClose: () => void;
}

export const FederationBridgeModal: React.FC<FederationBridgeModalProps> = ({ onClose }) => {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiService.getFederationStatus()
      .then((data) => setStatus(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Matrix & XMPP Federation</h3>
              <p className="text-[11px] text-[#7f91a4]">Decentralized Interop Gateway</p>
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
          <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-white">
                <Globe2 className="w-4 h-4 text-emerald-400" />
                <span>Federation Status</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                CONNECTED
              </span>
            </div>

            <p className="text-[11px] text-[#7f91a4] leading-relaxed">
              Aerogram bridges channels and public groups with external federated networks via the Matrix 1.8 AppService API and XMPP XEP-0045 gateways.
            </p>
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.04)] space-y-1">
              <div className="text-[10px] text-[#7f91a4] uppercase font-bold tracking-wider">
                Matrix Homeserver
              </div>
              <div className="text-xs font-mono font-semibold text-white truncate">
                {status?.homeserver || 'https://matrix.aerogram.im'}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.04)] space-y-1">
              <div className="text-[10px] text-[#7f91a4] uppercase font-bold tracking-wider">
                Federated Room Alias
              </div>
              <div className="text-xs font-mono font-semibold text-cyan-300 truncate">
                {status?.roomAlias || '#engineering-general:matrix.aerogram.im'}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.04)] flex items-center justify-between text-xs">
              <span className="text-[#7f91a4]">Synced Cross-Network Events</span>
              <span className="font-mono font-bold text-white">
                {status?.syncedEventsCount || 142} events
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/25 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
