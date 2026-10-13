import React, { useEffect, useState } from 'react';
import { X, CalendarClock, Trash2 } from 'lucide-react';
import { ApiService, ScheduledMessage } from '../services/api';

interface ScheduledMessagesModalProps {
  chatId: string;
  onClose: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ScheduledMessagesModal: React.FC<ScheduledMessagesModalProps> = ({
  chatId,
  onClose,
}) => {
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await ApiService.getScheduledMessages(chatId);
      setItems(res.scheduled);
    } catch (err: any) {
      setError(err?.message || 'Failed to load scheduled messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const cancel = async (id: string) => {
    try {
      await ApiService.cancelScheduledMessage(id);
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to cancel scheduled message:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-[#3fc5f0]/15 border border-[#3fc5f0]/30 text-[#3fc5f0]">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Scheduled Messages</h3>
              <p className="text-[11px] text-[#7f91a4]">Delivery Queued on the Server</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7f91a4] hover:text-white hover:bg-[#242f3d]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-96 overflow-y-auto space-y-2">
          {loading ? (
            <p className="py-10 text-center text-xs text-[#7f91a4]">Loading…</p>
          ) : error ? (
            <p className="py-10 text-center text-xs text-red-400">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-xs text-[#7f91a4]">
              No scheduled messages in this chat yet. Long-press the send button (or use the clock)
              to schedule one.
            </p>
          ) : (
            items.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0f1822]"
              >
                <div className="min-w-0">
                  <p className="text-xs text-white truncate">{m.content_text}</p>
                  <p className="text-[10px] text-[#3fc5f0] mt-0.5">{formatWhen(m.scheduled_at)}</p>
                </div>
                <button
                  onClick={() => cancel(m.id)}
                  title="Cancel scheduled message"
                  className="p-1.5 ml-3 flex-shrink-0 rounded-lg text-[#7f91a4] hover:text-red-400 hover:bg-[#242f3d]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
