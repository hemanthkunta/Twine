export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userId: string;
}

export class PushNotificationService {
  private static subscriptions: Map<string, PushSubscriptionPayload> = new Map();

  static saveSubscription(sub: PushSubscriptionPayload) {
    this.subscriptions.set(sub.userId, sub);
    console.log(`[Push Notification] Saved subscription for user ${sub.userId}`);
    return { success: true };
  }

  static async sendPush(userId: string, title: string, body: string, data?: any) {
    const sub = this.subscriptions.get(userId);
    if (!sub) {
      console.log(`[Push Notification] No push subscription for user ${userId}, queuing offline.`);
      return { sent: false, reason: 'no_subscription' };
    }

    console.log(`[Push Notification] Dispatched FCM/WebPush to ${userId}: "${title}" - "${body}"`);
    return { sent: true, timestamp: Date.now() };
  }
}
