import React, { useState } from 'react';
import { Sparkles, FileText, X, Check, Globe, HelpCircle } from 'lucide-react';
import { ApiService } from '../services/api';

interface AIAssistantBarProps {
  chatId: string;
  smartReplies: string[];
  onSelectReply: (replyText: string) => void;
}

export const AIAssistantBar: React.FC<AIAssistantBarProps> = ({
  chatId,
  smartReplies,
  onSelectReply,
}) => {
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const handleFetchSummary = async () => {
    setLoadingSummary(true);
    setShowSummary(true);
    try {
      const res = await ApiService.getAISummary(chatId);
      setSummaryData(res);
    } catch (err) {
      console.error('Failed to get summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <>
      <div className="w-full bg-[#0e1621] px-4 py-1.5 flex justify-center select-none">
        <div className="w-full max-w-3xl flex items-center justify-between overflow-x-auto space-x-2">
          {/* Smart reply pills */}
          <div className="flex items-center space-x-1.5 min-w-0 overflow-x-auto py-0.5">
            <div className="flex items-center space-x-1 text-[11px] font-semibold text-[#3fc5f0] flex-shrink-0 pr-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Replies:</span>
            </div>

            {smartReplies.map((reply, idx) => (
              <button
                key={idx}
                onClick={() => onSelectReply(reply)}
                className="px-3 py-1 rounded-full bg-[#182533] hover:bg-[#2b5278] text-white/90 hover:text-white text-xs whitespace-nowrap transition-all border border-[rgba(255,255,255,0.06)] shadow-sm active:scale-95 flex-shrink-0"
              >
                {reply}
              </button>
            ))}
          </div>

          {/* Action: Summarize thread */}
          <button
            onClick={handleFetchSummary}
            className="px-3 py-1 rounded-xl bg-[#2f88ff]/15 hover:bg-[#2f88ff]/25 text-[#3fc5f0] text-xs font-semibold flex items-center space-x-1.5 flex-shrink-0 transition-colors border border-[#2f88ff]/20"
            title="Summarize conversation with AI"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Summarize</span>
          </button>
        </div>
      </div>

      {/* Summary Modal / Popover */}
      {showSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="w-full max-w-lg glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.06)] bg-[#17212b]">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-[#3fc5f0]" />
                <h3 className="text-base font-bold text-white">AI Conversation Summary</h3>
              </div>
              <button
                onClick={() => setShowSummary(false)}
                className="p-1 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {loadingSummary ? (
                <div className="py-12 text-center text-xs text-[#7f91a4] flex flex-col items-center space-y-2">
                  <span className="animate-spin text-xl">✨</span>
                  <span>Generating intelligent conversation summary...</span>
                </div>
              ) : summaryData ? (
                <>
                  <div className="p-3.5 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] text-xs text-white/90 leading-relaxed">
                    {summaryData.summary}
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-[#3fc5f0] uppercase tracking-wider mb-2">
                      Key Takeaways
                    </h4>
                    <ul className="space-y-1.5">
                      {summaryData.keyPoints.map((kp: string, i: number) => (
                        <li key={i} className="flex items-start space-x-2 text-xs text-white/80">
                          <Check className="w-3.5 h-3.5 text-[#22c55e] flex-shrink-0 mt-0.5" />
                          <span>{kp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">
                      Action Items
                    </h4>
                    <ul className="space-y-1.5">
                      {summaryData.actionItems.map((ai: string, i: number) => (
                        <li key={i} className="flex items-start space-x-2 text-xs text-white/80">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                          <span>{ai}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
