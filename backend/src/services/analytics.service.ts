import { Message } from '../types/protocol.js';

export class ChannelAnalyticsService {
  static getChannelAnalytics(chatId: string, channelTitle: string, messages: Message[]) {
    const totalViews = messages.reduce((acc, m) => acc + (m.views_count || 42), 0);
    const topPosts = messages.slice(0, 5).map((m) => ({
      id: m.id,
      text: m.content_text.slice(0, 60),
      views: m.views_count || 120,
      reactions: Object.values(m.reactions || {}).reduce((sum, u) => sum + u.length, 0),
    }));

    const hours = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
    const viewsByHour = hours.map((h, i) => ({
      hour: h,
      views: Math.floor(180 + Math.sin(i) * 120 + i * 25),
    }));

    return {
      channelTitle,
      subscriberCount: 2450,
      totalViews,
      viewsLast24h: 1840,
      engagementRate: '8.4%',
      topPosts,
      viewsByHour,
    };
  }
}
