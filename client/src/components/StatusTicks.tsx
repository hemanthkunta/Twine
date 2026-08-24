import React from 'react';
import { Check, CheckCheck, Clock } from 'lucide-react';
import { ReceiptStatus } from '../types/index';

interface StatusTicksProps {
  status: ReceiptStatus;
  isSending?: boolean;
  className?: string;
}

export const StatusTicks: React.FC<StatusTicksProps> = ({
  status,
  isSending = false,
  className = '',
}) => {
  if (isSending || status === 'QUEUED') {
    return (
      <span title={status === 'QUEUED' ? 'Queued (Offline store-and-forward)' : 'Sending...'}>
        <Clock className={`w-3 h-3 text-amber-400/80 animate-pulse ${className}`} />
      </span>
    );
  }

  if (status === 'READ') {
    return (
      <span title="Read">
        <CheckCheck
          className={`w-3.5 h-3.5 text-[#3fc5f0] drop-shadow-[0_0_4px_rgba(63,197,240,0.5)] ${className}`}
        />
      </span>
    );
  }

  if (status === 'DELIVERED') {
    return (
      <span title="Delivered">
        <CheckCheck className={`w-3.5 h-3.5 text-white/70 ${className}`} />
      </span>
    );
  }

  return (
    <span title="Sent">
      <Check className={`w-3.5 h-3.5 text-white/60 ${className}`} />
    </span>
  );
};
