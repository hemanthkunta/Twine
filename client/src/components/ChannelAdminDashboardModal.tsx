import React, { useState, useEffect } from 'react';
import { BarChart3, Users, Eye, TrendingUp, X, Sparkles, Radio, Shield, Heart } from 'lucide-react';
import { ApiService } from '../services/api';
import { ChannelAnalytics } from '../types/index';

interface ChannelAdminDashboardModalProps {
  chatId: string;
  channelTitle: string;
  onClose: () => void;
}

export const ChannelAdminDashboardModal: React.FC<ChannelAdminDashboardModalProps> = ({
  chatId,
  channelTitle,
  onClose,
}) => {
  const [analytics, setAnalytics] = useState<ChannelAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiService.getChannelAnalytics(chatId)
      .then((data) => setAnalytics(data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [chatId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-2xl glass-modal rounded-3xl overflow-hidden shadow-2xl border border-[rgba(255,255,255,0.12)]">
        {/* Header */}
        <div className="p-4 px-6 bg-[#17212b] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Channel Analytics & Admin Dashboard</h3>
              <p className="text-[11px] text-[#7f91a4]">{channelTitle}</p>
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
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#7f91a4]">Loading broadcast telemetry...</div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center space-x-1.5 text-[10px] text-[#7f91a4] font-semibold uppercase tracking-wider mb-1">
                    <Users className="w-3.5 h-3.5 text-blue-400" />
                    <span>Subscribers</span>
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {analytics?.subscriberCount || '2,450'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center space-x-1.5 text-[10px] text-[#7f91a4] font-semibold uppercase tracking-wider mb-1">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Total Views</span>
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {analytics?.totalViews || '14.2k'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center space-x-1.5 text-[10px] text-[#7f91a4] font-semibold uppercase tracking-wider mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-[#3fc5f0]" />
                    <span>Last 24h</span>
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    +{analytics?.viewsLast24h || '1,840'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center space-x-1.5 text-[10px] text-[#7f91a4] font-semibold uppercase tracking-wider mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>Engagement</span>
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {analytics?.engagementRate || '8.4%'}
                  </div>
                </div>
              </div>

              {/* 24-Hour Views Histogram */}
              <div className="p-4 rounded-2xl bg-[#0f1822] border border-[rgba(255,255,255,0.06)] space-y-3">
                <h4 className="text-xs font-bold text-[#7f91a4] uppercase tracking-wider">
                  Hourly Viewer Traffic
                </h4>
                <div className="h-28 flex items-end justify-between space-x-2 pt-4 px-2">
                  {(analytics?.viewsByHour || []).map((v, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center space-y-1">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-[#2f88ff] to-[#3fc5f0] transition-all duration-500"
                        style={{ height: `${Math.max(16, (v.views / 300) * 80)}px` }}
                      />
                      <span className="text-[9px] font-mono text-[#7f91a4]">{v.hour}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Performing Broadcasts */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#7f91a4] uppercase tracking-wider">
                  Top Performing Broadcast Posts
                </h4>
                <div className="space-y-1.5">
                  {(analytics?.topPosts || []).map((post, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-[#0f1822] border border-[rgba(255,255,255,0.04)] flex items-center justify-between text-xs"
                    >
                      <span className="text-white/90 truncate flex-1 mr-4">{post.text}</span>
                      <div className="flex items-center space-x-3 text-[11px] font-mono text-[#7f91a4] flex-shrink-0">
                        <span className="flex items-center space-x-1">
                          <Eye className="w-3 h-3 text-emerald-400" />
                          <span>{post.views}</span>
                        </span>
                        <span className="flex items-center space-x-1">
                          <Heart className="w-3 h-3 text-rose-400" />
                          <span>{post.reactions}</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-[#1e2a38] hover:bg-[#28384b] text-white font-semibold text-xs rounded-xl border border-[rgba(255,255,255,0.08)] transition-all"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
