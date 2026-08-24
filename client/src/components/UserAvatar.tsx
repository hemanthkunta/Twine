import React from 'react';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  isOnline,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl font-bold',
  };

  const badgeSizes = {
    sm: 'w-2.5 h-2.5 right-0 bottom-0 border-[1.5px]',
    md: 'w-3.5 h-3.5 right-0 bottom-0 border-2',
    lg: 'w-4 h-4 right-0.5 bottom-0.5 border-2',
    xl: 'w-5 h-5 right-1 bottom-1 border-3',
  };

  // Generate deterministic gradient from name
  const getGradient = (str: string) => {
    const gradients = [
      'linear-gradient(135deg, #2af598 0%, #009efd 100%)',
      'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
      'linear-gradient(135deg, #7F00FF 0%, #E100FF 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % gradients.length;
    return gradients[idx];
  };

  const getInitials = (str: string) => {
    if (!str) return '?';
    const parts = str.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  return (
    <div className={`relative inline-flex flex-shrink-0 select-none ${className}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover shadow-sm bg-[#1e2a38] border border-[rgba(255,255,255,0.08)]`}
          onError={(e) => {
            // Fallback to gradient if image fails
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : null}

      {/* Fallback initials if avatar fails or not provided */}
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-medium text-white shadow-sm`}
        style={{
          background: getGradient(name || 'User'),
          display: avatarUrl ? 'none' : 'flex',
        }}
      >
        {getInitials(name)}
      </div>

      {/* Online presence badge */}
      {isOnline !== undefined && (
        <span
          className={`absolute rounded-full border-[#17212b] ${badgeSizes[size]} ${
            isOnline ? 'bg-[#22c55e] pulse-online' : 'bg-[#5e6d7d]'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
};
