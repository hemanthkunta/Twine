import React, { useState } from 'react';
import { Flame, Clock, X, Check, Timer } from 'lucide-react';
import { disappearingService, DisappearingTimer } from '../services/disappearing.service';

interface DisappearingTimerModalProps {
  chatId: string;
  onClose: () => void;
  onTimerChanged: (timer: DisappearingTimer) => void;
}

export const DisappearingTimerModal: React.FC<DisappearingTimerModalProps> = ({
  chatId,
  onClose,
  onTimerChanged,
}) => {
  const [selectedTimer, setSelectedTimer] = useState<DisappearingTimer>(
    disappearingService.getChatTimer(chatId)
  );

  const timers: { value: DisappearingTimer; label: string; desc: string }[] = [
    { value: 0, label: 'Off', desc: 'Messages stay in chat history forever' },
    { value: 30, label: '30 Seconds', desc: 'Self-destructs 30 seconds after viewing' },
    { value: 300, label: '5 Minutes', desc: 'Self-destructs 5 minutes after viewing' },
    { value: 3600, label: '1 Hour', desc: 'Self-destructs 1 hour after viewing' },
    { value: 86400, label: '24 Hours', desc: 'Self-destructs 1 day after viewing' },
    { value: 604800, label: '1 Week', desc: 'Self-destructs 7 days after viewing' },
  ];

  const handleSave = () => {
    disappearingService.setChatTimer(chatId, selectedTimer);
    onTimerChanged(selectedTimer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400">
              <Flame className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Disappearing Messages</h3>
              <p className="text-[11px] text-[#7f91a4]">Auto-Delete Messages from All Devices</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options List */}
        <div className="p-6 space-y-2">
          {timers.map((t) => {
            const isSelected = selectedTimer === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setSelectedTimer(t.value)}
                className={`w-full p-3 rounded-2xl border flex items-center justify-between text-left transition-all ${
                  isSelected
                    ? 'border-orange-500 bg-orange-500/10 shadow-md'
                    : 'border-[rgba(255,255,255,0.06)] bg-[#0f1822] hover:bg-[#162230]'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`p-2 rounded-xl ${
                      isSelected ? 'bg-orange-500 text-white' : 'bg-[#17212b] text-[#7f91a4]'
                    }`}
                  >
                    <Timer className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{t.label}</div>
                    <div className="text-[10px] text-[#7f91a4]">{t.desc}</div>
                  </div>
                </div>

                {isSelected && <Check className="w-4 h-4 text-orange-400" />}
              </button>
            );
          })}

          <button
            onClick={handleSave}
            className="w-full mt-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-95 font-bold text-white text-xs rounded-xl shadow-lg shadow-orange-500/20 transition-all"
          >
            Set Self-Destruct Timer
          </button>
        </div>
      </div>
    </div>
  );
};
