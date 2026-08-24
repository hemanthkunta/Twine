import React, { useState } from 'react';
import { Bot, Shield, ShieldCheck, ShieldAlert, X, Check, Sliders, AlertTriangle } from 'lucide-react';

interface AIModerationModalProps {
  chatTitle: string;
  onClose: () => void;
}

export const AIModerationModal: React.FC<AIModerationModalProps> = ({ chatTitle, onClose }) => {
  const [sensitivity, setSensitivity] = useState<'LOW' | 'MEDIUM' | 'STRICT'>('MEDIUM');
  const [deleteSpam, setDeleteSpam] = useState(true);
  const [warnToxicity, setWarnToxicity] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const mockAuditLogs = [
    {
      time: '12m ago',
      user: '@cryptobot_99',
      action: 'DELETED',
      reason: 'Detected cryptocurrency phishing URL pattern',
      badge: 'bg-red-500/20 text-red-300 border-red-500/30',
    },
    {
      time: '1h ago',
      user: '@anon_user',
      action: 'WARNED',
      reason: 'Flagged for toxic / abusive language',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
  ];

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">AI Content Moderation Bot</h3>
              <p className="text-[11px] text-[#7f91a4]">{chatTitle}</p>
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
          {/* Sensitivity Selector */}
          <div>
            <label className="block text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-2">
              Moderation Sensitivity
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'LOW', label: 'Low', desc: 'Phishing only' },
                { id: 'MEDIUM', label: 'Medium', desc: 'Spam + Toxicity' },
                { id: 'STRICT', label: 'Strict', desc: 'Zero links' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSensitivity(s.id as any)}
                  className={`p-3 rounded-2xl border text-center transition-all ${
                    sensitivity === s.id
                      ? 'border-purple-500 bg-purple-500/15 shadow-md'
                      : 'border-[rgba(255,255,255,0.06)] bg-[#0f1822] hover:bg-[#17212b]'
                  }`}
                >
                  <div className="text-xs font-bold text-white mb-0.5">{s.label}</div>
                  <div className="text-[10px] text-[#7f91a4]">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Auto-Delete Phishing & Scam Links</div>
                <div className="text-[10px] text-[#7f91a4]">Immediately remove malicious URLs</div>
              </div>
              <input
                type="checkbox"
                checked={deleteSpam}
                onChange={(e) => setDeleteSpam(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
            </div>

            <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Issue Toxicity & Harassment Warnings</div>
                <div className="text-[10px] text-[#7f91a4]">Bot responds with warning banner</div>
              </div>
              <input
                type="checkbox"
                checked={warnToxicity}
                onChange={(e) => setWarnToxicity(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
            </div>
          </div>

          {/* Recent Audit Log */}
          <div>
            <h4 className="text-xs font-bold text-[#7f91a4] uppercase tracking-wider mb-2">
              Recent Automated Bot Actions
            </h4>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {mockAuditLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[#0f1822] border border-[rgba(255,255,255,0.04)] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white flex items-center space-x-1.5">
                      <span>{log.user}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${log.badge}`}>
                        {log.action}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#7f91a4] mt-0.5">{log.reason}</div>
                  </div>
                  <span className="text-[10px] text-[#7f91a4]">{log.time}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/25 transition-all"
          >
            {savedSuccess ? 'Settings Applied ✓' : 'Save AI Moderation Rules'}
          </button>
        </div>
      </div>
    </div>
  );
};
