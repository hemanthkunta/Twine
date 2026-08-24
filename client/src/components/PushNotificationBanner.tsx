import React, { useState, useEffect } from 'react';
import { Bell, BellRing, X, Check, Shield } from 'lucide-react';
import { ApiService } from '../services/api';

export const PushNotificationBanner: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const dismissed = sessionStorage.getItem('push_banner_dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    }
  }, []);

  const handleEnablePush = async () => {
    if (!('Notification' in window)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setSubscribed(true);
        // Simulate VAPID subscription payload
        await ApiService.subscribePush({
          endpoint: 'https://fcm.googleapis.com/fcm/send/aerogram_web_push',
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9Ac',
            auth: 'tBHItJI5svbpez7KI4CCXg',
          },
        });

        // Show a test notification
        new Notification('Aerogram Messenger', {
          body: '🔔 Real-time push notifications are now enabled!',
          icon: '/favicon.ico',
        });

        setTimeout(() => setShowBanner(false), 2000);
      } else {
        setShowBanner(false);
      }
    } catch (err) {
      console.error(err);
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('push_banner_dismissed', 'true');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="bg-gradient-to-r from-[#17212b] to-[#1e2a38] border-b border-[rgba(255,255,255,0.08)] px-4 py-2 flex items-center justify-between text-xs z-30 select-none shadow-md">
      <div className="flex items-center space-x-2.5">
        <div className="p-1.5 rounded-lg bg-[#2f88ff]/20 text-[#3fc5f0]">
          {subscribed ? <BellRing className="w-4 h-4 text-emerald-400" /> : <Bell className="w-4 h-4" />}
        </div>
        <div>
          <span className="font-semibold text-white">Enable Push Notifications</span>
          <span className="text-[#7f91a4] hidden sm:inline ml-2">
            Receive instant message alerts when offline or backgrounded
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <button
          onClick={handleEnablePush}
          className="px-3 py-1 bg-gradient-to-r from-[#2f88ff] to-[#3fc5f0] hover:opacity-95 text-white font-semibold text-xs rounded-lg shadow-sm transition-all"
        >
          {subscribed ? 'Enabled ✓' : 'Enable'}
        </button>
        <button onClick={handleDismiss} className="p-1 text-[#7f91a4] hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
