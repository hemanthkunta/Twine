import React from 'react';

interface UserStatusBadgeProps {
  isOnline?: boolean;
  lastSeenAt?: string;
  isTyping?: boolean;
  className?: string;
}

export const UserStatusBadge: React.FC<UserStatusBadgeProps> = ({
  isOnline,
  lastSeenAt,
  isTyping,
  className = '',
}) => {
  if (isTyping) {
    return (
      <div className={`flex items-center space-x-1 text-[#3fc5f0] text-xs font-medium ${className}`}>
        <span>typing</span>
        <span className="flex space-x-0.5 items-center pl-0.5">
          <span className="typing-dot"></span>
          <span className="typing-dot"></span>
          <span className="typing-dot"></span>
        </span>
      </div>
    );
  }

  if (isOnline) {
    return (
      <div className={`flex items-center space-x-1.5 text-[#22c55e] text-xs font-medium ${className}`}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] pulse-online"></span>
        <span>online</span>
      </div>
    );
  }

  const formatLastSeen = (timestamp?: string) => {
    if (!timestamp) return 'last seen recently';
    try {
      const date = new Date(timestamp);
      const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);
      if (diffMinutes < 1) return 'last seen just now';
      if (diffMinutes < 60) return `last seen ${diffMinutes}m ago`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `last seen ${diffHours}h ago`;
      return `last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    } catch {
      return 'last seen recently';
    }
  };

  return (
    <span className={`text-xs text-[#7f91a4] font-normal ${className}`}>
      {formatLastSeen(lastSeenAt)}
    </span>
  );
};
