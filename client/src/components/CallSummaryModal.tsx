import React from 'react';
import { Sparkles, X, Check, Phone, FileText, Clock, ShieldCheck } from 'lucide-react';

interface CallSummaryModalProps {
  summaryData: {
    title: string;
    summary: string;
    keyDecisions: string[];
    actionItems: string[];
    durationFormatted: string;
  };
  onClose: () => void;
}

export const CallSummaryModal: React.FC<CallSummaryModalProps> = ({ summaryData, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#3fc5f0]/15 border border-[#3fc5f0]/30 text-[#3fc5f0]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{summaryData.title}</h3>
              <p className="text-[11px] text-[#7f91a4]">AI Live Call Transcription & Summary</p>
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
          <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] text-xs text-white/90 leading-relaxed">
            {summaryData.summary}
          </div>

          <div>
            <h4 className="text-xs font-bold text-[#3fc5f0] uppercase tracking-wider mb-2">
              Key Decisions Made
            </h4>
            <ul className="space-y-1.5">
              {summaryData.keyDecisions.map((kd, idx) => (
                <li key={idx} className="flex items-start space-x-2 text-xs text-white/80">
                  <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <span>{kd}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
              Action Items
            </h4>
            <ul className="space-y-1.5">
              {summaryData.actionItems.map((ai, idx) => (
                <li key={idx} className="flex items-start space-x-2 text-xs text-white/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                  <span>{ai}</span>
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 font-semibold text-white text-xs rounded-xl shadow-lg transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
